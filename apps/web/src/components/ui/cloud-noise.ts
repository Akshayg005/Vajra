import * as THREE from 'three';

/**
 * Tileable 3D cloud noise (Schneider, "The real-time volumetric cloudscapes of Horizon: Zero Dawn").
 *   R: Perlin-Worley (billowy base shape)
 *   G/B/A: Worley fBm at increasing frequency (erosion detail)
 * Built once on the CPU with a deterministic integer hash and cached for every renderer instance.
 */

const hash3 = (x: number, y: number, z: number, s: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const wrap = (v: number, p: number) => ((v % p) + p) % p;
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** periodic gradient noise in [-1, 1] with integer period p */
function perlin(x: number, y: number, z: number, p: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const g = (ix: number, iy: number, iz: number, dx: number, dy: number, dz: number) => {
    const h = hash3(wrap(ix, p), wrap(iy, p), wrap(iz, p), seed);
    // 12 edge gradients
    const k = Math.floor(h * 12);
    const gx = k < 4 ? (k & 1 ? -1 : 1) : k < 8 ? 0 : k & 1 ? -1 : 1;
    const gy = k < 4 ? (k & 2 ? -1 : 1) : k < 8 ? (k & 1 ? -1 : 1) : 0;
    const gz = k < 4 ? 0 : k < 8 ? (k & 2 ? -1 : 1) : k & 2 ? -1 : 1;
    return gx * dx + gy * dy + gz * dz;
  };
  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(g(xi, yi, zi, xf, yf, zf), g(xi + 1, yi, zi, xf - 1, yf, zf), u), l(g(xi, yi + 1, zi, xf, yf - 1, zf), g(xi + 1, yi + 1, zi, xf - 1, yf - 1, zf), u), v),
    l(l(g(xi, yi, zi + 1, xf, yf, zf - 1), g(xi + 1, yi, zi + 1, xf - 1, yf, zf - 1), u), l(g(xi, yi + 1, zi + 1, xf, yf - 1, zf - 1), g(xi + 1, yi + 1, zi + 1, xf - 1, yf - 1, zf - 1), u), v),
    w,
  );
}

/** periodic Worley (F1) in [0, 1], cells per side = c; returned inverted (1 = at a feature point) */
function worley(x: number, y: number, z: number, c: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let d = 9;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const cz = zi + dz;
        const wx = wrap(cx, c);
        const wy = wrap(cy, c);
        const wz = wrap(cz, c);
        const px = cx + hash3(wx, wy, wz, seed) - x;
        const py = cy + hash3(wx, wy, wz, seed + 1) - y;
        const pz = cz + hash3(wx, wy, wz, seed + 2) - z;
        const dd = px * px + py * py + pz * pz;
        if (dd < d) d = dd;
      }
  return 1 - Math.min(1, Math.sqrt(d));
}

const remap = (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a)) * (d - c);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

let cached: THREE.Data3DTexture | null = null;

export function cloudNoiseTexture(size = 64): THREE.Data3DTexture {
  if (cached) return cached;
  const data = new Uint8Array(size * size * size * 4);
  let i = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const w = z / size;
        // Perlin fBm, periods 4/8/16
        let pf = 0;
        let amp = 1;
        let norm = 0;
        for (let o = 0; o < 3; o++) {
          const f = 4 << o;
          pf += amp * perlin(u * f, v * f, w * f, f, 11 + o);
          norm += amp;
          amp *= 0.5;
        }
        pf = clamp01((pf / norm) * 0.75 + 0.5);
        const w1 = worley(u * 4, v * 4, w * 4, 4, 101);
        const w2 = worley(u * 8, v * 8, w * 8, 8, 202);
        const w3 = worley(u * 16, v * 16, w * 16, 16, 303);
        const wf = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
        const pw = clamp01(remap(pf, wf - 1, 1, 0, 1));
        const w4 = worley(u * 24, v * 24, w * 24, 24, 404);
        data[i++] = pw * 255;
        data[i++] = (w2 * 0.625 + w3 * 0.25 + w4 * 0.125) * 255;
        data[i++] = (w3 * 0.625 + w4 * 0.375) * 255;
        data[i++] = w4 * 255;
      }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
