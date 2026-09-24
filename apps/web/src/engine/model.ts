import type { MultiTaskProbs, XaiContribution, XaiExplanation } from '@vajra/contracts';
import { sigmoid } from './geo';
import type { CellAgent } from './cells';

/**
 * VAJRA "model": a multi-task logistic head over physically meaningful engine features.
 * Stand-in for the trained ConvLSTM/UNet ensemble; same interface (features -> 5 probabilities).
 * Because it is additive in logit space, every prediction decomposes EXACTLY into feature contributions.
 */

type Feat = Exclude<XaiContribution['feature'], 'bias'>;

export interface FeatureVector {
  iwv_rise: number;
  ctt_drop: number;
  cape_cin: number;
  convergence: number;
  shear: number;
  flash_trend: number;
}

const META: Record<Feat, { label: string; unit: string; mean: number; sd: number }> = {
  iwv_rise: { label: 'IWV rise (GNSS)', unit: 'mm/h', mean: 1.0, sd: 1.2 },
  ctt_drop: { label: 'Cloud-top cooling', unit: 'K/15min', mean: 2, sd: 6 },
  cape_cin: { label: 'CAPE minus CIN', unit: 'J/kg', mean: 1600, sd: 900 },
  convergence: { label: 'Low-level convergence', unit: 'e-5/s', mean: 2, sd: 2.5 },
  shear: { label: '0-6 km shear', unit: 'm/s', mean: 12, sd: 6 },
  flash_trend: { label: 'Flash-rate trend', unit: 'fl/min per 10 min', mean: 0.5, sd: 4 },
};

const W: Record<keyof MultiTaskProbs, { b: number; w: Record<Feat, number> }> = {
  thunderstorm: { b: -0.9, w: { iwv_rise: 0.45, ctt_drop: 0.75, cape_cin: 0.6, convergence: 0.5, shear: 0.25, flash_trend: 0.55 } },
  lightning: { b: -1.1, w: { iwv_rise: 0.3, ctt_drop: 0.85, cape_cin: 0.55, convergence: 0.35, shear: 0.2, flash_trend: 0.9 } },
  hail: { b: -2.9, w: { iwv_rise: 0.1, ctt_drop: 0.7, cape_cin: 0.8, convergence: 0.25, shear: 0.75, flash_trend: 0.6 } },
  gust50: { b: -2.2, w: { iwv_rise: 0.05, ctt_drop: 0.5, cape_cin: 0.55, convergence: 0.3, shear: 0.85, flash_trend: 0.35 } },
  heavyRain: { b: -1.6, w: { iwv_rise: 0.95, ctt_drop: 0.45, cape_cin: 0.3, convergence: 0.55, shear: -0.1, flash_trend: 0.2 } },
};

export function cellFeatures(c: CellAgent): FeatureVector {
  const h = c.history;
  const old = h.length >= 6 ? h[h.length - 6] : h[0];
  const flashTrend = old ? c.flashRate - old.flashRate : 0;
  return {
    iwv_rise: c.env.iwvRise,
    ctt_drop: c.cttCoolingK15,
    cape_cin: c.env.capeJkg - 3 * Math.abs(c.env.cinJkg),
    convergence: c.env.convergence,
    shear: c.env.shear06,
    flash_trend: flashTrend,
  };
}

function z(f: Feat, v: number) {
  const m = META[f];
  return Math.max(-3, Math.min(3, (v - m.mean) / m.sd));
}

/** intensity prior: a mature 55 dBZ core is already a thunderstorm; the head refines around it */
function prior(c: CellAgent): number {
  return (c.maxDbz - 40) / 6;
}

export function predict(c: CellAgent): MultiTaskProbs {
  const x = cellFeatures(c);
  const out = {} as MultiTaskProbs;
  const p0 = prior(c);
  for (const k of Object.keys(W) as (keyof MultiTaskProbs)[]) {
    let L = W[k].b + p0 * (k === 'thunderstorm' || k === 'lightning' ? 1 : 0.6);
    for (const f of Object.keys(META) as Feat[]) L += W[k].w[f] * z(f, x[f]);
    out[k] = Math.min(0.99, Math.max(0.01, sigmoid(L)));
  }
  return out;
}

/**
 * Exact additive attribution. p = sigmoid(b' + sum w_i z_i).
 * Baseline share = sigmoid(b') (bias incl. intensity prior). The remainder (p - p0) is split across
 * features in proportion to their logit terms. The ratio (p-p0)/(L-b') is always > 0, so signs are kept.
 * Displayed values are rounded to 0.1 pp and the rounding residual is put on the largest term,
 * so the numbers on screen always add up to the probability on screen.
 */
export function explain(c: CellAgent, target: keyof MultiTaskProbs = 'thunderstorm'): XaiExplanation {
  const x = cellFeatures(c);
  const bPrime = W[target].b + prior(c) * (target === 'thunderstorm' || target === 'lightning' ? 1 : 0.6);
  const terms = (Object.keys(META) as Feat[]).map((f) => ({ f, logit: W[target].w[f] * z(f, x[f]) }));
  const L = bPrime + terms.reduce((a, t) => a + t.logit, 0);
  const p = Math.min(0.99, Math.max(0.01, sigmoid(L)));
  const p0 = sigmoid(bPrime);
  const denom = L - bPrime;
  const ratio = Math.abs(denom) < 1e-6 ? 0 : (p - p0) / denom;
  const contributions: XaiContribution[] = [
    { feature: 'bias', label: 'Base rate + echo intensity', value: c.maxDbz, unit: 'dBZ', pp: p0 * 100, logit: bPrime },
    ...terms.map((t) => ({
      feature: t.f,
      label: META[t.f].label,
      value: x[t.f],
      unit: META[t.f].unit,
      pp: t.logit * ratio * 100,
      logit: t.logit,
    })),
  ];
  // round to 0.1 and fix residual
  const target100 = Math.round(p * 1000) / 10;
  contributions.forEach((c2) => (c2.pp = Math.round(c2.pp * 10) / 10));
  const sum = contributions.reduce((a, c2) => a + c2.pp, 0);
  const resid = Math.round((target100 - sum) * 10) / 10;
  if (resid !== 0) {
    let bi = 0;
    contributions.forEach((c2, i) => {
      if (Math.abs(c2.pp) > Math.abs(contributions[bi].pp)) bi = i;
    });
    contributions[bi].pp = Math.round((contributions[bi].pp + resid) * 10) / 10;
  }
  const top = [...contributions].filter((c2) => c2.feature !== 'bias').sort((a, b) => b.pp - a.pp);
  const pos = top.filter((t) => t.pp > 0.5).slice(0, 2);
  const neg = top.filter((t) => t.pp < -0.5).slice(-1);
  const phr: Record<string, string> = {
    iwv_rise: `moisture is building fast (IWV +${x.iwv_rise.toFixed(1)} mm/h)`,
    ctt_drop: `cloud tops are cooling ${x.ctt_drop.toFixed(1)} K per 15 min`,
    cape_cin: `the air is very unstable (CAPE-CIN ${Math.round(x.cape_cin)} J/kg)`,
    convergence: `winds are converging near the surface`,
    shear: `wind shear of ${x.shear.toFixed(0)} m/s organises the storm`,
    flash_trend: `lightning is increasing (${x.flash_trend >= 0 ? '+' : ''}${x.flash_trend.toFixed(1)} fl/min in 10 min)`,
  };
  const negPhr: Record<string, string> = {
    iwv_rise: 'moisture is not rising',
    ctt_drop: 'cloud tops are warming (storm weakening)',
    cape_cin: 'the lower air is capped',
    convergence: 'surface winds are diverging',
    shear: 'shear is weak, so storms are short-lived',
    flash_trend: 'lightning is dropping',
  };
  let reason = `${Math.round(p * 100)}% chance: `;
  reason += pos.length ? pos.map((t) => phr[t.feature]).join(' and ') : `the echo is ${c.maxDbz.toFixed(0)} dBZ`;
  if (neg.length) reason += `; held back because ${negPhr[neg[0].feature]}`;
  reason += '.';
  return { target, probability: target100 / 100, contributions, reason };
}
