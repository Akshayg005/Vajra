import type { GridField } from '@vajra/contracts';
import type { CellAgent } from './cells';
import { KM_PER_DEG_LAT, clamp, kmPerDegLng } from './geo';

/** Grid geometry for a scenario domain. Radar mosaic at ~2 km, derived fields coarser. */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly bbox: [number, number, number, number];
  readonly dLng: number;
  readonly dLat: number;
  readonly resKm: number;
  constructor(bbox: [number, number, number, number], resKm: number) {
    this.bbox = bbox;
    this.resKm = resKm;
    const midLat = (bbox[1] + bbox[3]) / 2;
    this.w = Math.round(((bbox[2] - bbox[0]) * kmPerDegLng(midLat)) / resKm);
    this.h = Math.round(((bbox[3] - bbox[1]) * KM_PER_DEG_LAT) / resKm);
    this.dLng = (bbox[2] - bbox[0]) / this.w;
    this.dLat = (bbox[3] - bbox[1]) / this.h;
  }
  lng(i: number) {
    return this.bbox[0] + (i + 0.5) * this.dLng;
  }
  lat(j: number) {
    return this.bbox[3] - (j + 0.5) * this.dLat;
  }
  i(lng: number) {
    return (lng - this.bbox[0]) / this.dLng - 0.5;
  }
  j(lat: number) {
    return (this.bbox[3] - lat) / this.dLat - 0.5;
  }
  field(name: GridField['name'], t: number, data?: Float32Array): GridField {
    return { name, width: this.w, height: this.h, bbox: this.bbox, resKm: this.resKm, t, data: data ?? new Float32Array(this.w * this.h) };
  }
  sample(data: Float32Array, lng: number, lat: number): number {
    const x = Math.round(this.i(lng));
    const y = Math.round(this.j(lat));
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return data[y * this.w + x];
  }
}

/**
 * Render reflectivity (dBZ) from cell agents. Each cell = anisotropic core + noise texture;
 * squall lines add a trailing stratiform region behind the leading edge.
 * Pixels combine with max() like a radar mosaic composite.
 */
export function renderDbz(
  g: Grid,
  cells: CellAgent[],
  out: Float32Array,
  n3: (x: number, y: number, z: number) => number,
  tMin: number,
  mask?: (lng: number, lat: number) => number,
) {
  out.fill(0);
  const kmLng = kmPerDegLng((g.bbox[1] + g.bbox[3]) / 2);
  for (const c of cells) {
    if (c.intensity < 0.05) continue;
    const a = c.radiusKm * Math.sqrt(c.elongation) * 1.9; // long axis
    const b = (c.radiusKm / Math.sqrt(c.elongation)) * 1.9;
    const ext = Math.max(a, b) * 2.2 + (c.type === 'squall' ? 40 : 0);
    const i0 = Math.max(0, Math.floor(g.i(c.lng - ext / kmLng)));
    const i1 = Math.min(g.w - 1, Math.ceil(g.i(c.lng + ext / kmLng)));
    const j0 = Math.max(0, Math.floor(g.j(c.lat + ext / KM_PER_DEG_LAT)));
    const j1 = Math.min(g.h - 1, Math.ceil(g.j(c.lat - ext / KM_PER_DEG_LAT)));
    const o = (c.orientationDeg * Math.PI) / 180;
    const so = Math.sin(o);
    const co = Math.cos(o);
    const hv = (c.headingDeg * Math.PI) / 180;
    const hx = Math.sin(hv);
    const hy = Math.cos(hv);
    const peak = c.maxDbz;
    for (let j = j0; j <= j1; j++) {
      const dy = (c.lat - g.lat(j)) * -KM_PER_DEG_LAT;
      for (let i = i0; i <= i1; i++) {
        const dx = (g.lng(i) - c.lng) * kmLng;
        // rotate into cell frame: u along the long axis, v across
        const u = dx * so + dy * co;
        const v = dx * co - dy * so;
        const r2 = (u * u) / (a * a) + (v * v) / (b * b);
        const noise = n3(g.lng(i) * 9, g.lat(j) * 9, tMin / 25 + c.wander) * 0.5 + n3(g.lng(i) * 30, g.lat(j) * 30, tMin / 12) * 0.25;
        let val = peak - 34 * r2 + noise * 7;
        if (c.type === 'squall' || c.type === 'multicell') {
          // trailing stratiform: behind the motion direction
          const along = dx * hx + dy * hy; // + ahead, - behind
          if (along < 0) {
            const behind = -along;
            const len = c.type === 'squall' ? 45 : 18;
            const s = Math.exp(-((behind - len * 0.5) ** 2) / (len * len * 0.35)) * Math.exp(-(u * u) / (a * a * 2.2));
            val = Math.max(val, 34 * s * Math.min(1, c.intensity * 1.3) + noise * 5);
          }
        }
        if (val < 12) continue;
        if (mask) val *= mask(g.lng(i), g.lat(j));
        const k = j * g.w + i;
        if (val > out[k]) out[k] = val;
      }
    }
  }
}

/** Satellite IR cloud-top temperature (K) on a coarse (~4 km, INSAT-like) grid, anvil spread downwind. */
export function renderCtt(g: Grid, cells: CellAgent[], out: Float32Array, n3: (x: number, y: number, z: number) => number, tMin: number, anvilDeg: number) {
  const kmLng = kmPerDegLng((g.bbox[1] + g.bbox[3]) / 2);
  const ax = Math.sin((anvilDeg * Math.PI) / 180);
  const ay = Math.cos((anvilDeg * Math.PI) / 180);
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      // clear-sky surface ~ 300-305 K with low cloud noise
      out[j * g.w + i] = 300 + n3(g.lng(i) * 2, g.lat(j) * 2, tMin / 90) * 6;
    }
  }
  for (const c of cells) {
    if (c.intensity < 0.08) continue;
    const anvilKm = 20 + c.radiusKm * 3 * c.intensity;
    const ext = anvilKm * 2.2;
    const i0 = Math.max(0, Math.floor(g.i(c.lng - ext / kmLng)));
    const i1 = Math.min(g.w - 1, Math.ceil(g.i(c.lng + ext / kmLng)));
    const j0 = Math.max(0, Math.floor(g.j(c.lat + ext / KM_PER_DEG_LAT)));
    const j1 = Math.min(g.h - 1, Math.ceil(g.j(c.lat - ext / KM_PER_DEG_LAT)));
    for (let j = j0; j <= j1; j++) {
      const dy = (g.lat(j) - c.lat) * KM_PER_DEG_LAT;
      for (let i = i0; i <= i1; i++) {
        const dx = (g.lng(i) - c.lng) * kmLng;
        const along = dx * ax + dy * ay - anvilKm * 0.35;
        const across = dx * ay - dy * ax;
        const r2 = (along * along) / (anvilKm * anvilKm * 1.4) + (across * across) / (anvilKm * anvilKm * 0.6);
        const f = Math.exp(-r2 * 1.6);
        const n = n3(g.lng(i) * 6, g.lat(j) * 6, tMin / 30) * 3;
        const v = 300 - (300 - c.cttK) * f + n * f;
        const k = j * g.w + i;
        if (v < out[k]) out[k] = v;
      }
    }
  }
}

/** Downsample by block-max (for motion estimation, verification and coarse products). */
export function downsample(src: Float32Array, w: number, h: number, f: number, mode: 'max' | 'mean' = 'max') {
  const W = Math.floor(w / f);
  const H = Math.floor(h / f);
  const out = new Float32Array(W * H);
  for (let J = 0; J < H; J++)
    for (let I = 0; I < W; I++) {
      let m = mode === 'max' ? -Infinity : 0;
      for (let y = 0; y < f; y++)
        for (let x = 0; x < f; x++) {
          const v = src[(J * f + y) * w + I * f + x];
          if (mode === 'max') m = v > m ? v : m;
          else m += v;
        }
      out[J * W + I] = mode === 'max' ? m : m / (f * f);
    }
  return { data: out, w: W, h: H };
}

/**
 * Optical-flow-style motion estimation by block matching between two radar frames (coarse grid).
 * Returns per-block displacement in coarse pixels per interval. Empty blocks fall back to the steering wind.
 */
export function blockMatch(prev: Float32Array, curr: Float32Array, w: number, h: number, block: number, search: number, fallback: [number, number]) {
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(h / block);
  const u = new Float32Array(bw * bh);
  const v = new Float32Array(bw * bh);
  const q = new Float32Array(bw * bh);
  for (let BJ = 0; BJ < bh; BJ++)
    for (let BI = 0; BI < bw; BI++) {
      let energy = 0;
      for (let y = BJ * block; y < Math.min(h, (BJ + 1) * block); y++)
        for (let x = BI * block; x < Math.min(w, (BI + 1) * block); x++) energy += curr[y * w + x] > 20 ? 1 : 0;
      const idx = BJ * bw + BI;
      if (energy < 3) {
        u[idx] = fallback[0];
        v[idx] = fallback[1];
        q[idx] = 0;
        continue;
      }
      let best = Infinity;
      let bu = 0;
      let bv = 0;
      for (let sy = -search; sy <= search; sy++)
        for (let sx = -search; sx <= search; sx++) {
          let err = 0;
          for (let y = BJ * block; y < Math.min(h, (BJ + 1) * block); y++) {
            const py = y - sy;
            if (py < 0 || py >= h) {
              err += 400;
              continue;
            }
            for (let x = BI * block; x < Math.min(w, (BI + 1) * block); x++) {
              const px = x - sx;
              const a = curr[y * w + x];
              const b2 = px < 0 || px >= w ? 0 : prev[py * w + px];
              const d = a - b2;
              err += d * d;
            }
          }
          // small penalty away from the background wind keeps vectors physical
          err += ((sx - fallback[0]) ** 2 + (sy - fallback[1]) ** 2) * 20;
          if (err < best) {
            best = err;
            bu = sx;
            bv = sy;
          }
        }
      u[idx] = bu;
      v[idx] = bv;
      q[idx] = 1;
    }
  // 3x3 smoothing, weighted by quality
  const us = new Float32Array(bw * bh);
  const vs = new Float32Array(bw * bh);
  for (let J = 0; J < bh; J++)
    for (let I = 0; I < bw; I++) {
      let su = 0;
      let sv = 0;
      let sw = 0;
      for (let y = -1; y <= 1; y++)
        for (let x = -1; x <= 1; x++) {
          const II = I + x;
          const JJ = J + y;
          if (II < 0 || JJ < 0 || II >= bw || JJ >= bh) continue;
          const wgt = 0.3 + q[JJ * bw + II] * (x === 0 && y === 0 ? 2 : 1);
          su += u[JJ * bw + II] * wgt;
          sv += v[JJ * bw + II] * wgt;
          sw += wgt;
        }
      us[J * bw + I] = su / sw;
      vs[J * bw + I] = sv / sw;
    }
  return { u: us, v: vs, bw, bh, block };
}

export type MotionField = ReturnType<typeof blockMatch>;

/**
 * Semi-Lagrangian backward advection of a field over `steps` intervals using the motion field
 * (motion given in coarse pixels per interval; `scale` converts coarse to fine pixels).
 * growth(i,j) optionally returns a dBZ increment at the destination (growth/decay term).
 */
export function advect(src: Float32Array, w: number, h: number, mf: MotionField, steps: number, scale: number, growth?: (i: number, j: number) => number) {
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const bi = Math.min(mf.bw - 1, Math.floor(i / scale / mf.block));
      const bj = Math.min(mf.bh - 1, Math.floor(j / scale / mf.block));
      const du = mf.u[bj * mf.bw + bi] * scale * steps;
      const dv = mf.v[bj * mf.bw + bi] * scale * steps;
      const si = i - du;
      const sj = j - dv;
      const x0 = Math.floor(si);
      const y0 = Math.floor(sj);
      let val = 0;
      if (x0 >= 0 && y0 >= 0 && x0 < w - 1 && y0 < h - 1) {
        const fx = si - x0;
        const fy = sj - y0;
        val =
          src[y0 * w + x0] * (1 - fx) * (1 - fy) +
          src[y0 * w + x0 + 1] * fx * (1 - fy) +
          src[(y0 + 1) * w + x0] * (1 - fx) * fy +
          src[(y0 + 1) * w + x0 + 1] * fx * fy;
      }
      if (growth) val = val > 5 ? val + growth(i, j) : val;
      out[j * w + i] = clamp(val, 0, 75);
    }
  return out;
}

/**
 * Neighbourhood probability: fraction of pixels within radius r (px) exceeding thr.
 * Radius grows with lead time to represent position uncertainty (like a neighbourhood ensemble).
 * Uses a summed-area table so cost is O(N) per radius.
 */
export function neighbourhoodProb(src: Float32Array, w: number, h: number, thr: number, r: number) {
  const sat = new Float32Array((w + 1) * (h + 1));
  for (let j = 0; j < h; j++) {
    let row = 0;
    for (let i = 0; i < w; i++) {
      row += src[j * w + i] >= thr ? 1 : 0;
      sat[(j + 1) * (w + 1) + i + 1] = sat[j * (w + 1) + i + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const y0 = Math.max(0, j - r);
    const y1 = Math.min(h, j + r + 1);
    for (let i = 0; i < w; i++) {
      const x0 = Math.max(0, i - r);
      const x1 = Math.min(w, i + r + 1);
      const s = sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      out[j * w + i] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** Fractions Skill Score between forecast and observed binary fields at neighbourhood radius r. */
export function fss(fc: Float32Array, ob: Float32Array, w: number, h: number, thr: number, r: number) {
  const pf = neighbourhoodProb(fc, w, h, thr, r);
  const po = neighbourhoodProb(ob, w, h, thr, r);
  let num = 0;
  let den = 0;
  for (let k = 0; k < pf.length; k++) {
    num += (pf[k] - po[k]) ** 2;
    den += pf[k] ** 2 + po[k] ** 2;
  }
  return den === 0 ? NaN : 1 - num / den;
}
