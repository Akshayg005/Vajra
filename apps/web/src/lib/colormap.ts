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

/** IR enhancement (storm palette): warm = transparent, cold tops = steel blue -> deep blue -> amber -> white (overshooting tops). */
export const CTT = buildLut(
  [
    [300, [0, 0, 0, 0]],
    [270, [120, 135, 160, 40]],
    [250, [150, 175, 205, 110]],
    [235, [90, 169, 255, 170]],
    [220, [37, 99, 235, 205]],
    [210, [245, 165, 36, 225]],
    [200, [255, 214, 120, 238]],
    [192, [255, 255, 255, 250]],
  ]
    .map(([v, c]) => [v, c] as Stop)
    .reverse() as Stop[],
  190,
  305,
);

/** Nowcast probability: navy -> storm blue -> amber -> pale gold (monotonic lightness, colour-blind safe), transparent below 10 %. */
export const PROB = buildLut(
  [
    [0, [0, 0, 0, 0]],
    [0.1, [20, 40, 80, 0]],
    [0.15, [30, 64, 120, 110]],
    [0.3, [47, 111, 214, 150]],
    [0.5, [90, 169, 255, 175]],
    [0.7, [245, 165, 36, 195]],
    [0.9, [255, 224, 138, 215]],
    [1, [255, 240, 200, 225]],
  ],
  0,
  1,
);

export const CONF = buildLut(
  [
    [0, [255, 122, 26, 150]],
    [0.35, [245, 165, 36, 115]],
    [0.6, [245, 165, 36, 60]],
    [0.8, [90, 169, 255, 16]],
    [1, [90, 169, 255, 0]],
  ],
  0,
  1,
);

export const DENSITY = buildLut(
  [
    [0, [0, 0, 0, 0]],
    [0.3, [30, 64, 120, 90]],
    [1, [47, 111, 214, 150]],
    [3, [90, 169, 255, 190]],
    [6, [245, 165, 36, 220]],
    [12, [255, 245, 220, 240]],
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
