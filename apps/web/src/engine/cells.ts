import type { CellHistorySample, EnvProfile, LifecycleStage, Scenario, StormType, TrackPoint } from '@vajra/contracts';
import type { Rng } from './prng';
import { angleDiff, clamp, moveKm, smoothstep } from './geo';

/** Internal (engine-side) storm agent. Converted to the StormCell contract in engine.ts. */
export interface CellAgent {
  id: string;
  label: string;
  lng: number;
  lat: number;
  type: StormType;
  /** peak potential 0..1.2 */
  strength: number;
  bornAt: number;
  /** minutes */
  growthMin: number;
  matureMin: number;
  decayMin: number;
  headingDeg: number;
  speedKmh: number;
  /** heading wander phase (noise) */
  wander: number;
  radiusKm: number;
  elongation: number;
  orientationDeg: number;
  /** extra flash-rate multiplier, set by a lightning jump; decays */
  jumpBoost: number;
  /** current derived values */
  intensity: number;
  maxDbz: number;
  echoTopKm: number;
  vil: number;
  flashRate: number;
  cttK: number;
  cttCoolingK15: number;
  jumpSigma: number;
  lightningJump: boolean;
  jumpUntil: number;
  hail: boolean;
  downburst: boolean;
  stage: LifecycleStage;
  env: EnvProfile;
  track: TrackPoint[];
  history: CellHistorySample[];
  /** flash rate samples every 2 min for the 2-sigma jump algorithm */
  frSamples: number[];
  lastSampleAt: number;
  lastTrackAt: number;
  dead: boolean;
  injected: boolean;
  /** ms simulation time at which this cell spawned a split already */
  splitDone: boolean;
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
let counter = 0;
export function resetCellCounter() {
  counter = 0;
}

export function makeCell(
  rng: Rng,
  t: number,
  lng: number,
  lat: number,
  type: StormType,
  strength: number,
  sc: Scenario,
  injected = false,
): CellAgent {
  counter++;
  const id = `${LETTERS[counter % LETTERS.length]}${String(counter).padStart(2, '0')}`;
  // lifetimes (minutes) by storm type: pulse ~45-70, multicell 90-150, squall 150-240, supercell 120-200
  const life: Record<StormType, [number, number, number]> = {
    pulse: [15, 20, 25],
    multicell: [25, 60, 40],
    squall: [30, 120, 60],
    supercell: [30, 100, 50],
  };
  const [g, m, d] = life[type];
  const k = rng.range(0.8, 1.25);
  // supercells deviate right of mean wind (right-movers), squalls move faster than the mean wind
  const dev = type === 'supercell' ? 25 : type === 'squall' ? 5 : rng.normal(0, 12);
  const spd = type === 'squall' ? 1.2 : type === 'supercell' ? 0.8 : rng.range(0.8, 1.05);
  return {
    id,
    label: `Cell ${id}`,
    lng,
    lat,
    type,
    strength: clamp(strength, 0.2, 1.2),
    bornAt: t,
    growthMin: g * k,
    matureMin: m * k,
    decayMin: d * k,
    headingDeg: (sc.steeringDeg + dev + 360) % 360,
    speedKmh: sc.steeringKmh * spd * rng.range(0.9, 1.1),
    wander: rng.range(0, 1000),
    radiusKm: type === 'squall' ? 14 : type === 'supercell' ? 11 : type === 'multicell' ? 10 : 6,
    elongation: type === 'squall' ? rng.range(4.5, 6) : type === 'multicell' ? rng.range(1.4, 2) : rng.range(1, 1.3),
    // squall lines are oriented roughly perpendicular to motion
    orientationDeg: type === 'squall' ? (sc.steeringDeg + 90) % 180 : rng.range(0, 180),
    jumpBoost: 1,
    intensity: 0,
    maxDbz: 20,
    echoTopKm: 3,
    vil: 0,
    flashRate: 0,
    cttK: 285,
    cttCoolingK15: 0,
    jumpSigma: 0,
    lightningJump: false,
    jumpUntil: 0,
    hail: false,
    downburst: false,
    stage: 'initiation',
    env: { capeJkg: sc.cape, cinJkg: -40, shear06: sc.shear, pwMm: sc.pw, iwvRise: 1, convergence: 2 },
    track: [],
    history: [],
    frSamples: [],
    lastSampleAt: t,
    lastTrackAt: -Infinity,
    dead: false,
    injected,
    splitDone: false,
  };
}

/** lifecycle envelope: 0 at birth, 1 at maturity, back to 0 at death */
export function envelope(c: CellAgent, t: number): { I: number; stage: LifecycleStage; ageMin: number } {
  const age = (t - c.bornAt) / 60000;
  const { growthMin: g, matureMin: m, decayMin: d } = c;
  let I: number;
  let stage: LifecycleStage;
  if (age < g * 0.35) {
    I = smoothstep(0, g, age) * 0.9;
    stage = 'initiation';
  } else if (age < g) {
    I = smoothstep(0, g, age);
    stage = 'growth';
  } else if (age < g + m) {
    // mature plateau with slow pulsing (new updrafts in multicells)
    I = 0.92 + 0.08 * Math.sin((age - g) / 7 + c.wander);
    stage = 'mature';
  } else {
    I = 1 - smoothstep(g + m, g + m + d, age);
    stage = 'decay';
  }
  return { I, stage, ageMin: age };
}

/**
 * Coupled microphysics proxies. One intensity number drives everything so every panel agrees:
 *   dBZ -> echo top -> VIL (Greene & Clark 1972, hail cap 56 dBZ) -> flash rate (Price & Rind 1992, H^4.9)
 *   -> cloud-top temperature (6.5 K/km lapse, floor at tropopause ~ 192 K).
 */
export function updatePhysics(c: CellAgent, t: number, dtMin: number, env: EnvProfile, rng: Rng, lightningFactor = 1) {
  const { I, stage } = envelope(c, t);
  const prevCtt = c.cttK;
  c.stage = stage;
  c.env = env;
  // environmental modulation: CAPE and shear feed the storm; CIN caps it
  const envK = clamp(0.55 + env.capeJkg / 6000 + env.shear06 / 80 - Math.abs(env.cinJkg) / 900, 0.4, 1.25);
  const eff = clamp(c.strength * I * envK, 0, 1.3);
  c.intensity = eff;
  const typeTop = c.type === 'supercell' ? 2.5 : c.type === 'squall' ? 1 : 0;
  // bounded change per tick: radar-observed cores cannot jump more than ~4 dBZ/min or tops ~0.8 km/min
  const dbzTarget = clamp(18 + 47 * eff + (c.type === 'supercell' ? 4 * eff : 0) + rng.normal(0, 0.6), 10, 72);
  const topTarget = clamp(3 + 12.5 * eff + typeTop * eff + rng.normal(0, 0.15), 2, 18.5);
  const dStep = 4 * dtMin + 0.3;
  const tStep = 0.8 * dtMin + 0.05;
  c.maxDbz = c.maxDbz + clamp(dbzTarget - c.maxDbz, -dStep, dStep);
  c.echoTopKm = c.echoTopKm + clamp(topTarget - c.echoTopKm, -tStep, tStep);
  const zCapped = Math.min(c.maxDbz, 56);
  const effDepthM = 0.42 * c.echoTopKm * 1000 * clamp((c.maxDbz - 18) / 40, 0, 1);
  c.vil = clamp(3.44e-6 * Math.pow(10, zCapped * 0.05714) * effDepthM, 0, 90);
  const pr = 3.44e-5 * Math.pow(c.echoTopKm, 4.9) * lightningFactor;
  c.jumpBoost = 1 + (c.jumpBoost - 1) * Math.exp(-dtMin / 12);
  // flash rate is an EMA (1-min time constant) of the Price-Rind rate so it never flickers between ticks
  const frTarget = clamp(pr * c.jumpBoost * (0.9 + 0.2 * Math.sin(t / 97000 + c.wander)), 0, 160);
  const a = 1 - Math.exp(-dtMin / 1.0);
  c.flashRate = c.flashRate + (frTarget - c.flashRate) * a;
  c.cttK = clamp(303 - 6.5 * c.echoTopKm, 192, 290);
  const dCtt = prevCtt - c.cttK; // positive = cooling
  c.cttCoolingK15 = dtMin > 0 ? c.cttCoolingK15 * 0.7 + 0.3 * (dCtt / dtMin) * 15 : c.cttCoolingK15;
  c.radiusKm = clamp((c.type === 'squall' ? 10 : c.type === 'supercell' ? 9 : c.type === 'multicell' ? 8 : 5) * (0.5 + 0.7 * I), 2.5, 22);
  // hail: VIL density (VIL / echo top) > 3.5 g/m3 or 60 dBZ reaching > 10 km
  const vilDensity = c.vil / Math.max(1, c.echoTopKm);
  c.hail = vilDensity > 3.3 || (c.maxDbz >= 60 && c.echoTopKm > 10);
  // downburst: rapid collapse of a deep core, or dry sub-cloud layer with a strong core
  const hLen = c.history.length;
  const vilDrop = hLen >= 5 ? (c.history[hLen - 5].vil - c.vil) / Math.max(1, c.history[hLen - 5].vil) : 0;
  c.downburst = (stage === 'decay' && vilDrop > 0.2 && c.history[Math.max(0, hLen - 5)]?.vil > 25) || (env.pwMm < 34 && c.maxDbz > 50);
}

/** Schultz et al. (2009) 2-sigma lightning jump. Samples flash rate every 2 min. */
export function sampleAndDetectJump(c: CellAgent, t: number): boolean {
  let fired = false;
  while (t - c.lastSampleAt >= 120000) {
    c.lastSampleAt += 120000;
    c.frSamples.push(c.flashRate);
    if (c.frSamples.length > 12) c.frSamples.shift();
    const s = c.frSamples;
    if (s.length >= 7) {
      // DFRDT over the last 5 intervals (10 min) -> sigma; current DFRDT vs 2 sigma
      const d: number[] = [];
      for (let i = 1; i < s.length; i++) d.push((s[i] - s[i - 1]) / 2);
      const cur = d[d.length - 1];
      const prev = d.slice(-6, -1);
      const mean = prev.reduce((a, b) => a + b, 0) / prev.length;
      const sd = Math.sqrt(prev.reduce((a, b) => a + (b - mean) ** 2, 0) / prev.length) || 0.05;
      c.jumpSigma = (cur - mean) / sd;
      const jump = cur > 2 * sd + mean && c.flashRate > 8 && cur > 0.4;
      if (jump && t > c.jumpUntil) {
        c.jumpUntil = t + 20 * 60000;
        fired = true;
      }
    }
  }
  c.lightningJump = t < c.jumpUntil;
  return fired;
}

export function recordHistory(c: CellAgent, t: number) {
  if (t - c.lastTrackAt >= 5 * 60000 || c.track.length === 0) {
    c.lastTrackAt = t;
    c.track.push({ t, lng: c.lng, lat: c.lat, maxDbz: c.maxDbz });
    if (c.track.length > 30) c.track.shift();
  }
  const last = c.history[c.history.length - 1];
  if (!last || t - last.t >= 2 * 60000) {
    c.history.push({ t, maxDbz: c.maxDbz, echoTopKm: c.echoTopKm, vil: c.vil, flashRate: c.flashRate, cttK: c.cttK });
    if (c.history.length > 60) c.history.shift();
  }
}

export function moveCell(c: CellAgent, dtMin: number, sc: Scenario, n2: (x: number, y: number) => number, t: number) {
  // slow heading wander keeps tracks realistic and forecasts imperfect
  const wobble = n2(c.wander, t / (40 * 60000)) * (c.type === 'pulse' ? 22 : 10);
  const target = (sc.steeringDeg + (c.type === 'supercell' ? 25 : 0) + wobble + 360) % 360;
  c.headingDeg = (c.headingDeg + angleDiff(target, c.headingDeg) * Math.min(1, dtMin / 20) + 360) % 360;
  const [lng, lat] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * dtMin) / 60);
  c.lng = lng;
  c.lat = lat;
}

/** Forecast track from current motion (what the nowcast "believes"). */
export function forecastTrack(c: CellAgent, t: number, minutes: number[]): TrackPoint[] {
  return minutes.map((m) => {
    const [lng, lat] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * m) / 60);
    const fut = envelope(c, t + m * 60000).I;
    return { t: t + m * 60000, lng, lat, maxDbz: clamp(18 + 47 * c.strength * fut, 10, 70) };
  });
}
