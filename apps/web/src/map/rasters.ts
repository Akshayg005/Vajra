import { BitmapLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM, type Layer } from '@deck.gl/core';
import type { GridField, NowcastFrame } from '@vajra/contracts';
import { gridToBitmap, type Lut } from '../lib/colormap';

/** A raster layer that cross-fades from the previous engine grid to the new one (no flicker between ticks). */
export interface Bmp {
  img: ImageBitmap | null;
  prev: ImageBitmap | null;
  at: number;
  key: number | string;
  bounds: [number, number, number, number];
}
export const emptyBmp = (): Bmp => ({ img: null, prev: null, at: 0, key: -1, bounds: [0, 0, 0, 0] });

/** Bitmaps that left the layer stack are closed 3 s later (deck.gl has long finished uploading them by then). */
const retired: { img: ImageBitmap; at: number }[] = [];
function retire(img: ImageBitmap | null) {
  const now = performance.now();
  if (img) retired.push({ img, at: now });
  while (retired.length && now - retired[0].at > 3000) retired.shift()!.img.close();
}

export function updateBmp(b: Bmp, key: number | string, g: GridField, lut: Lut, opts?: { hatch?: boolean; alphaScale?: number }) {
  if (b.key === key || g.width < 2) return;
  b.key = key;
  void gridToBitmap(g, lut, opts).then((img) => {
    if (b.key !== key) return;
    retire(b.prev);
    b.prev = b.img;
    b.img = img;
    b.at = performance.now();
    b.bounds = g.bbox;
  });
}

export function setBmp(b: Bmp, img: ImageBitmap | null, bounds: [number, number, number, number]) {
  retire(b.prev);
  b.prev = b.img;
  b.img = img;
  b.at = performance.now();
  b.bounds = bounds;
}

export function bmpLayers(id: string, b: Bmp, opacity: number, now: number, fade = 250): Layer[] {
  if (!b.img) return [];
  const k = Math.min(1, (now - b.at) / fade);
  const common = { bounds: b.bounds, _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT, textureParameters: { minFilter: 'linear' as const, magFilter: 'linear' as const } };
  const out: Layer[] = [];
  if (b.prev && k < 1) out.push(new BitmapLayer({ id: `${id}-prev`, image: b.prev, opacity: opacity * (1 - k), ...common }));
  out.push(new BitmapLayer({ id, image: b.img, opacity: opacity * (b.prev ? k : 1), ...common }));
  return out;
}

const BAND_RGB: Record<string, [number, number, number]> = {
  // sequential storm-blue ramp (lightest = soonest): colour-blind safe, never confused with IMD severity colours
  '0-30': [230, 240, 255],
  '30-60': [156, 201, 255],
  '60-120': [90, 169, 255],
  '120-180': [47, 111, 214],
};

/** Composite of the four lead-time bands: each pixel takes the earliest band with P >= 25 %. */
export async function bandComposite(frames: NowcastFrame[]): Promise<ImageBitmap | null> {
  const main = frames.filter((f) => !f.extended);
  if (!main.length) return null;
  const { width: w, height: h } = main[0].prob;
  const img = new ImageData(w, h);
  for (let k = 0; k < w * h; k++) {
    for (const f of main) {
      const p = f.prob.data[k];
      if (p >= 0.25) {
        const [r, g, b] = BAND_RGB[f.band];
        img.data[k * 4] = r;
        img.data[k * 4 + 1] = g;
        img.data[k * 4 + 2] = b;
        img.data[k * 4 + 3] = 40 + Math.min(1, p) * 110;
        break;
      }
    }
  }
  return createImageBitmap(img);
}

/** 3-6 h extended zone: diagonal hatch where P >= 22 % (low confidence). */
export async function extendedHatch(frames: NowcastFrame[]): Promise<ImageBitmap | null> {
  const f = frames.find((x) => x.extended);
  if (!f) return null;
  const { width: w, height: h } = f.prob;
  const img = new ImageData(w, h);
  for (let k = 0; k < w * h; k++) {
    if (f.prob.data[k] < 0.22) continue;
    const x = k % w;
    const y = (k / w) | 0;
    if ((x + y) % 4 > 0) continue;
    img.data[k * 4] = 196;
    img.data[k * 4 + 1] = 181;
    img.data[k * 4 + 2] = 253;
    img.data[k * 4 + 3] = 150;
  }
  return createImageBitmap(img);
}
