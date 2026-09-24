import type { GridField } from '@vajra/contracts';

type Stop = [number, [number, number, number, number]];

function buildLut(stops: Stop[], min: number, max: number, n = 256) {
  const lut = new Uint8ClampedArray(n * 4);
  for (let k = 0; k < n; k++) {
    const v = min + ((max - min) * k) / (n - 1);
    let i = 0;
    while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    const t = Math.max(0, Math.min(1, (v - v0) / (v1 - v0 || 1)));
    for (let ch = 0; ch < 4; ch++) lut[k * 4 + ch] = c0[ch] + (c1[ch] - c0[ch]) * t;
  }
  return { lut, min, max, n };
}

/** NWS-like reflectivity scale, tuned for a dark basemap (transparent below 15 dBZ). */
export const DBZ = buildLut(
  [
    [10, [0, 0, 0, 0]],
    [15, [30, 90, 160, 70]],
    [20, [40, 150, 200, 150]],
    [30, [30, 190, 120, 190]],
    [35, [60, 210, 60, 205]],
    [40, [240, 230, 40, 215]],
    [45, [250, 170, 30, 225]],
    [50, [245, 90, 30, 235]],
    [55, [220, 30, 40, 240]],
    [60, [200, 40, 160, 245]],
    [65, [240, 200, 255, 250]],
    [72, [255, 255, 255, 255]],
  ],
  0,
  75,
);

/** IR enhancement: warm = transparent, cold tops = cyan -> violet -> white (colour-blind friendly ramp). */
export const CTT = buildLut(
  [
    [300, [0, 0, 0, 0]],
    [270, [120, 130, 150, 40]],
    [250, [150, 170, 200, 110]],
    [235, [60, 180, 230, 170]],
    [220, [110, 110, 240, 200]],
    [210, [170, 80, 230, 220]],
    [200, [240, 90, 190, 235]],
    [192, [255, 255, 255, 250]],
  ].map(([v, c]) => [v, c] as Stop).reverse() as Stop[],
  190,
  305,
);

/** Nowcast probability: viridis-like (colour-blind safe), transparent below 10 %. */
export const PROB = buildLut(
  [
    [0, [0, 0, 0, 0]],
    [0.1, [68, 1, 84, 0]],
    [0.15, [72, 40, 120, 110]],
    [0.3, [49, 104, 142, 150]],
    [0.5, [33, 145, 140, 175]],
    [0.7, [94, 201, 98, 195]],
    [0.9, [253, 231, 37, 215]],
    [1, [253, 231, 37, 225]],
  ],
  0,
  1,
);

export const CONF = buildLut(
  [
    [0, [239, 68, 68, 150]],
    [0.35, [251, 146, 60, 120]],
    [0.6, [250, 204, 21, 70]],
    [0.8, [34, 211, 238, 18]],
    [1, [34, 211, 238, 0]],
  ],
  0,
  1,
);

export const DENSITY = buildLut(
  [
    [0, [0, 0, 0, 0]],
    [0.3, [60, 20, 120, 90]],
    [1, [124, 58, 237, 150]],
    [3, [34, 211, 238, 190]],
    [6, [253, 231, 37, 220]],
    [12, [255, 255, 255, 240]],
  ],
  0,
  12,
);

export type Lut = ReturnType<typeof buildLut>;

/** Grid -> ImageData using a LUT. Optional hatch pattern (for the low-confidence 3-6 h zone). */
export function gridToImage(g: GridField, lut: Lut, opts: { hatch?: boolean; alphaScale?: number } = {}): ImageData {
  const { width: w, height: h, data } = g;
  const img = new ImageData(w, h);
  const px = img.data;
  const { lut: L, min, max, n } = lut;
  const scale = (n - 1) / (max - min);
  const aS = opts.alphaScale ?? 1;
  for (let k = 0; k < w * h; k++) {
    const v = data[k];
    let idx = Math.round((v - min) * scale);
    idx = idx < 0 ? 0 : idx >= n ? n - 1 : idx;
    const o = k * 4;
    const a = L[idx * 4 + 3] * aS;
    if (a < 2) continue;
    if (opts.hatch) {
      const x = k % w;
      const y = (k / w) | 0;
      if ((x + y) % 5 > 1) continue;
    }
    px[o] = L[idx * 4];
    px[o + 1] = L[idx * 4 + 1];
    px[o + 2] = L[idx * 4 + 2];
    px[o + 3] = a;
  }
  return img;
}

export async function gridToBitmap(g: GridField, lut: Lut, opts?: { hatch?: boolean; alphaScale?: number }) {
  return createImageBitmap(gridToImage(g, lut, opts));
}

export function lutCss(lut: Lut, steps = 12) {
  const stops: string[] = [];
  for (let i = 0; i < steps; i++) {
    const k = Math.round((i / (steps - 1)) * (lut.n - 1));
    const [r, g, b, a] = [lut.lut[k * 4], lut.lut[k * 4 + 1], lut.lut[k * 4 + 2], lut.lut[k * 4 + 3]];
    stops.push(`rgba(${r},${g},${b},${Math.max(0.15, a / 255)}) ${(i / (steps - 1)) * 100}%`);
  }
  return `linear-gradient(90deg, ${stops.join(',')})`;
}
