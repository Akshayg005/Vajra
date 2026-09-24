import type { AnomalyType, SensorStatus } from '@vajra/contracts';
import type { Rng } from './prng';
import { clamp, distanceKm } from './geo';
import { TOWNS } from './places';

/** IMD Doppler Weather Radar network (subset, approximate site locations). Range ring 250 km. */
const DWR: [string, number, number][] = [
  ['DWR Kolkata (Alipore)', 88.33, 22.53],
  ['DWR Patna', 85.09, 25.6],
  ['DWR Ranchi', 85.32, 23.35],
  ['DWR Paradip', 86.67, 20.26],
  ['DWR Gopalpur', 84.88, 19.27],
  ['DWR Mumbai (Veravali)', 72.85, 19.13],
  ['DWR Mumbai (Colaba)', 72.82, 18.9],
  ['DWR Delhi (Palam)', 77.1, 28.57],
  ['DWR Delhi (Ayanagar)', 77.13, 28.48],
  ['DWR Nagpur', 79.06, 21.1],
  ['DWR Solapur', 75.9, 17.67],
  ['DWR Lucknow', 80.89, 26.76],
  ['DWR Agartala', 91.24, 23.89],
  ['DWR Mohanbari', 95.02, 27.48],
  ['DWR Jaipur', 75.81, 26.82],
  ['DWR Bhopal', 77.42, 23.28],
  ['DWR Hyderabad', 78.47, 17.45],
  ['DWR Visakhapatnam', 83.3, 17.72],
  ['DWR Machilipatnam', 81.13, 16.18],
  ['DWR Chennai', 80.29, 13.07],
  ['DWR Karaikal', 79.84, 10.92],
  ['DWR Kochi', 76.27, 9.96],
  ['DWR Goa', 73.83, 15.49],
  ['DWR Bhuj', 69.67, 23.25],
  ['DWR Srinagar', 74.8, 34.08],
  ['DWR Sohra', 91.73, 25.28],
];

export interface SensorAgent extends SensorStatus {
  /** hidden truth for the detector demo */
  injected: AnomalyType | null;
  injectedUntil: number;
  base: number;
  driftAcc: number;
  healedAt: number;
  hits?: number;
  clean?: number;
}

export function makeSensors(rng: Rng, center: [number, number], bbox: [number, number, number, number]): SensorAgent[] {
  const list: SensorAgent[] = [];
  const mk = (id: string, name: string, kind: SensorStatus['kind'], lng: number, lat: number, extra: Partial<SensorAgent> = {}): SensorAgent => ({
    id,
    name,
    kind,
    lng,
    lat,
    latencySec: kind === 'dwr' ? 180 : kind === 'satellite' ? 420 : kind === 'lightning' ? 4 : kind === 'nwp' ? 3600 : 60,
    uptimePct: rng.range(97.5, 99.9),
    trust: rng.range(0.9, 0.99),
    state: 'ok',
    anomaly: null,
    anomalySince: null,
    series: [],
    injected: null,
    injectedUntil: 0,
    base: kind === 'aws' ? rng.range(29, 36) : 1,
    driftAcc: 0,
    healedAt: 0,
    ...extra,
  });
  DWR.forEach(([n, lng, lat], i) => list.push(mk(`dwr-${i}`, n, 'dwr', lng, lat, { rangeKm: 250 })));
  list.push(mk('sat-3dr', 'INSAT-3DR Imager (MOSDAC)', 'satellite', 74, 0));
  list.push(mk('sat-3ds', 'INSAT-3DS Imager (MOSDAC)', 'satellite', 82, 0));
  list.push(mk('nwp-ncum', 'NCUM 12 km (NCMRWF)', 'nwp', center[0], center[1]));
  list.push(mk('nwp-wrf', 'WRF 3 km (IMD)', 'nwp', center[0], center[1]));
  // lightning location network sensors near the domain
  for (let k = 0; k < 6; k++) {
    const lng = rng.range(bbox[0], bbox[2]);
    const lat = rng.range(bbox[1], bbox[3]);
    list.push(mk(`lln-${k}`, `LLN sensor ${k + 1}`, 'lightning', lng, lat));
  }
  // AWS at towns inside the domain
  TOWNS.filter((t) => t.lng > bbox[0] && t.lng < bbox[2] && t.lat > bbox[1] && t.lat < bbox[3])
    .slice(0, 14)
    .forEach((t, k) => list.push(mk(`aws-${k}`, `AWS ${t.name}`, 'aws', t.lng + 0.03, t.lat - 0.02)));
  return list;
}

/**
 * One health step. Readings are synthesised (with injected faults), then detected with simple, real detectors:
 *  spike  : |x - median| > 4 * MAD
 *  frozen : last 8 readings identical
 *  drift  : mean offset vs neighbour consensus > 2.5 units and growing
 *  dropout: no reading for > 3x the expected latency
 * Trust = product of latency and detector scores. Trust < 0.45 => excluded from fusion; after the fault
 * ends the sensor passes a probation window ("recovering") before returning to ok (self-healing).
 */
export function stepSensors(sensors: SensorAgent[], t: number, rng: Rng, localTempAt: (lng: number, lat: number) => number, onEvent: (s: SensorAgent, text: string) => void) {
  for (const s of sensors) {
    // random fault injection: ~1 fault per sensor per ~30 h of sim time
    if (!s.injected && rng.chance(0.00012)) injectFault(s, rng.pick(['spike', 'frozen', 'drift', 'dropout'] as AnomalyType[]), t, rng);
    if (s.injected && t > s.injectedUntil) {
      s.injected = null;
      s.driftAcc = 0;
    }
    const truth = s.kind === 'aws' ? localTempAt(s.lng, s.lat) : s.base + rng.normal(0, 0.03);
    let reading: number | null = truth + rng.normal(0, s.kind === 'aws' ? 0.15 : 0.02);
    let latency = nominal(s) * rng.range(0.85, 1.25);
    if (s.injected === 'spike' && rng.chance(0.35)) reading = truth + rng.pick([-1, 1]) * rng.range(8, 15);
    if (s.injected === 'frozen') reading = s.series[s.series.length - 1] ?? truth;
    if (s.injected === 'drift') {
      s.driftAcc += 0.12;
      reading = truth + s.driftAcc;
    }
    if (s.injected === 'dropout') {
      reading = null;
      latency = nominal(s) * 6;
    }
    if (reading !== null) {
      s.series.push(Math.round(reading * 100) / 100);
      if (s.series.length > 40) s.series.shift();
    }
    s.latencySec = s.latencySec * 0.7 + latency * 0.3;
    // --- detectors (consensus = neighbour/background estimate; persistence required to avoid flapping) ---
    let raw: AnomalyType | null = null;
    const ser = s.series;
    const last = ser[ser.length - 1];
    const consensus = truth;
    if (reading === null || s.latencySec > nominal(s) * 3) raw = 'dropout';
    else if (ser.length >= 8 && ser.slice(-8).every((x) => x === last)) raw = 'frozen';
    else if (Math.abs(last - consensus) > (s.kind === 'aws' ? 6 : 1.5)) raw = 'spike';
    else if (Math.abs(last - consensus) > (s.kind === 'aws' ? 2.5 : 0.6)) raw = 'drift';
    s.hits = raw ? (s.hits ?? 0) + 1 : 0;
    s.clean = raw ? 0 : (s.clean ?? 0) + 1;
    const detected: AnomalyType | null = raw && (s.hits >= 2 || raw === 'dropout' || raw === 'frozen') ? raw : null;
    const latScore = clamp(1.25 - s.latencySec / (nominal(s) * 3), 0, 1);
    const detScore = detected ? (detected === 'dropout' ? 0.1 : 0.3) : 1;
    const target = clamp(latScore * detScore * (0.95 + rng.normal(0, 0.01)), 0.02, 0.99);
    s.trust = s.trust + (target - s.trust) * 0.25;
    s.uptimePct = clamp(s.uptimePct + (reading === null ? -0.02 : 0.002), 90, 99.99);
    const prevState = s.state;
    if (detected) {
      s.anomaly = detected;
      s.anomalySince = s.anomalySince ?? t;
      s.state = s.trust < 0.45 ? 'excluded' : 'degraded';
    } else if ((s.state === 'excluded' || s.state === 'degraded') && (s.clean ?? 0) >= 3) {
      s.state = 'recovering';
      s.healedAt = t;
    } else if (s.state === 'recovering' && t - s.healedAt > 10 * 60000 && s.trust > 0.8) {
      s.state = 'ok';
      s.anomaly = null;
      s.anomalySince = null;
    }
    if (prevState !== s.state) {
      if (s.state === 'excluded') onEvent(s, `${s.name}: ${s.anomaly} detected, trust ${Math.round(s.trust * 100)}%, auto-excluded from fusion`);
      if (s.state === 'recovering') onEvent(s, `${s.name}: fault cleared, on probation (recovering)`);
      if (s.state === 'ok' && prevState === 'recovering') onEvent(s, `${s.name}: self-healed, back in fusion`);
    }
  }
}

function nominal(s: SensorStatus) {
  return s.kind === 'dwr' ? 180 : s.kind === 'satellite' ? 420 : s.kind === 'lightning' ? 4 : s.kind === 'nwp' ? 3600 : 60;
}

export function injectFault(s: SensorAgent, a: AnomalyType, t: number, rng: Rng) {
  s.injected = a;
  s.injectedUntil = t + rng.range(12, 25) * 60000;
}

/** radar coverage quality at a point: best active DWR within range */
export function radarCoverage(sensors: SensorAgent[], lng: number, lat: number): number {
  let best = 0.15;
  for (const s of sensors) {
    if (s.kind !== 'dwr' || s.state === 'excluded') continue;
    const d = distanceKm(lng, lat, s.lng, s.lat);
    if (d > 260) continue;
    const q = d < 150 ? 1 : 1 - ((d - 150) / 110) * 0.65;
    if (q > best) best = q;
  }
  return best;
}
