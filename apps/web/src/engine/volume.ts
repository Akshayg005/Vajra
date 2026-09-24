import type { StormCell } from '@vajra/contracts';
import { Rng } from './prng';

/** 3D reflectivity volume from the cell profile (engine-side, seeded by cell id so it is stable between frames). */
export const Z_SCALE = 0.55;

export function stormVolume(c: StormCell, n = 6000): { positions: Float32Array; dbz: Float32Array } {
  const rng = new Rng(c.id.charCodeAt(0) * 131 + (c.id.charCodeAt(1) || 0) * 17 + (c.id.charCodeAt(2) || 0));
  const pos: number[] = [];
  const val: number[] = [];
  const R = c.radiusKm * 0.3;
  const top = c.echoTopKm;
  for (let i = 0; i < n; i++) {
    const h = rng.f() * top;
    const coreH = top * 0.4;
    // storm widens aloft (anvil) and tilts downshear
    const widen = 1 + Math.max(0, (h - top * 0.65) / (top * 0.35)) * 2.2;
    const r = Math.sqrt(rng.f()) * R * widen * 1.6;
    const th = rng.f() * Math.PI * 2;
    const tilt = (h / top) * R * 0.8;
    const x = Math.cos(th) * r + tilt;
    const z = Math.sin(th) * r * (1 / Math.sqrt(c.elongation));
    const radial = r / (R * widen * 1.6);
    const vert = Math.abs(h - coreH) / top;
    const dbz = c.maxDbz - 30 * radial * radial - 28 * vert * vert - (h > top * 0.7 ? 12 : 0);
    if (dbz < 15) continue;
    pos.push(x, h * Z_SCALE, z);
    val.push(dbz);
  }
  return { positions: new Float32Array(pos), dbz: new Float32Array(val) };
}

/** A jagged lightning channel (CG reaches the ground, IC stays between charge layers). Deterministic per bolt index. */
export function boltPath(k: number, echoTopKm: number, cg: boolean): [number, number, number][] {
  const rng = new Rng(0x9e37 + k * 7919);
  const top = echoTopKm * Z_SCALE * (cg ? 0.55 : 0.75);
  const pts: [number, number, number][] = [];
  let x = rng.range(-0.6, 0.6);
  let z = rng.range(-0.6, 0.6);
  const y1 = cg ? 0 : top * 0.45;
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const y = top + ((y1 - top) * i) / steps;
    x += rng.normal(0, cg ? 0.12 : 0.25);
    z += rng.normal(0, cg ? 0.12 : 0.25);
    pts.push([x, y, z]);
  }
  return pts;
}

/** CG share used for the 3D animation (IC:CG ≈ 3.5:1 as in the engine). */
export const isCgBolt = (k: number) => ((k * 2654435761) >>> 0) % 100 < 22;
