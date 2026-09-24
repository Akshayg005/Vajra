import type { CitizenReport, LightningStrike } from '@vajra/contracts';
import type { CellAgent } from './cells';
import type { Rng } from './prng';
import { distanceKm } from './geo';
import { nearestTown } from './places';

const TEXTS: Record<CitizenReport['event'], string[]> = {
  lightning: ['Bijli giri khet ke paas', 'Lightning struck a palm tree near the pond', 'Very loud thunder, flashes every few seconds', 'বাজ পড়ল মাঠে', 'Lightning hit transformer, power gone'],
  hail: ['Ole pad rahe hain, chane jitne', 'Pea-size hail for 5 minutes', 'Hail damaged mango crop', 'ଶିଳାବୃଷ୍ଟି ହେଉଛି'],
  damage: ['Tree fell on the road, traffic stuck', 'Tin roofs blown off in the village', 'Hoarding collapsed near the market', 'Electric pole down'],
  waterlogging: ['Knee-deep water at the underpass', 'Road flooded near the station', 'Water entering houses in low area', 'Paani bhar gaya gali mein'],
};

/**
 * Verification of a crowd report against the engine's observations:
 *  lightning: CG/IC strikes within 8 km and +/-10 min
 *  hail: a cell with a hail flag / VIL > 30 within 15 km
 *  damage: a cell with a downburst flag or >50 dBZ within 20 km
 *  waterlogging: >45 dBZ within 10 km in the last 30 min (proxy for >25 mm/h)
 * Duplicate: same event within 3 km and 15 min of an existing report. Fake: no supporting signal at all.
 */
export function verifyReport(r: Omit<CitizenReport, 'status' | 'matchScore' | 'matchReason'>, strikes: LightningStrike[], cells: CellAgent[], existing: CitizenReport[]): CitizenReport {
  const dup = existing.find((e) => e.event === r.event && e.status !== 'fake' && distanceKm(e.lng, e.lat, r.lng, r.lat) < 3 && Math.abs(e.t - r.t) < 15 * 60000);
  if (dup) return { ...r, status: 'duplicate', matchScore: dup.matchScore, matchReason: `Same ${r.event} as ${dup.id} (${distanceKm(dup.lng, dup.lat, r.lng, r.lat).toFixed(1)} km away)`, duplicateOf: dup.id };
  let score = 0;
  let reason = '';
  if (r.event === 'lightning') {
    const near = strikes.filter((s) => Math.abs(s.t - r.t) < 10 * 60000 && distanceKm(s.lng, s.lat, r.lng, r.lat) < 8);
    score = Math.min(1, near.length / 4);
    reason = near.length ? `${near.length} strikes within 8 km / 10 min (nearest ${Math.min(...near.map((s) => distanceKm(s.lng, s.lat, r.lng, r.lat))).toFixed(1)} km)` : 'No strikes detected within 8 km in the last 10 min';
  } else {
    const radius = r.event === 'hail' ? 15 : r.event === 'damage' ? 20 : 10;
    const near = cells.filter((c) => distanceKm(c.lng, c.lat, r.lng, r.lat) < radius + c.radiusKm);
    const best = near.sort((a, b) => b.maxDbz - a.maxDbz)[0];
    if (best) {
      if (r.event === 'hail') score = best.hail ? 0.95 : best.vil > 30 ? 0.7 : best.maxDbz > 50 ? 0.4 : 0.1;
      if (r.event === 'damage') score = best.downburst ? 0.9 : best.maxDbz > 50 ? 0.65 : 0.25;
      if (r.event === 'waterlogging') score = best.maxDbz > 45 ? 0.85 : 0.35;
      reason = `Cell ${best.id}: ${best.maxDbz.toFixed(0)} dBZ, VIL ${best.vil.toFixed(0)} kg/m²${best.hail ? ', hail flag' : ''}${best.downburst ? ', downburst flag' : ''}`;
    } else {
      reason = `No echo above 35 dBZ within ${radius} km`;
    }
  }
  const status: CitizenReport['status'] = score >= 0.5 ? 'verified' : score >= 0.15 ? 'unverified' : 'fake';
  return { ...r, status, matchScore: Math.round(score * 100) / 100, matchReason: reason };
}

let rid = 0;
/** Crowd generator: most reports come from real storm impacts; ~12% are duplicates or noise/fake. */
export function maybeCrowdReport(rng: Rng, t: number, cells: CellAgent[], strikes: LightningStrike[], existing: CitizenReport[], bbox: [number, number, number, number], ratePerMin: number, dtMin: number): CitizenReport | null {
  if (!rng.chance(1 - Math.exp(-ratePerMin * dtMin))) return null;
  rid++;
  let lng: number;
  let lat: number;
  let event: CitizenReport['event'];
  const roll = rng.f();
  const active = cells.filter((c) => c.maxDbz > 45);
  if (roll < 0.1 || !active.length) {
    // noise / fake: random clear-sky location
    lng = rng.range(bbox[0], bbox[2]);
    lat = rng.range(bbox[1], bbox[3]);
    event = rng.pick(['lightning', 'hail', 'damage'] as const);
  } else if (roll < 0.2 && existing.length) {
    const e = rng.pick(existing);
    lng = e.lng + rng.normal(0, 0.01);
    lat = e.lat + rng.normal(0, 0.01);
    event = e.event;
  } else {
    const c = rng.pick(active);
    const recent = strikes.filter((s) => s.cellId === c.id).slice(-5);
    if (recent.length && rng.chance(0.55)) {
      const s = rng.pick(recent);
      lng = s.lng + rng.normal(0, 0.02);
      lat = s.lat + rng.normal(0, 0.02);
      event = 'lightning';
    } else {
      lng = c.lng + rng.normal(0, 0.06);
      lat = c.lat + rng.normal(0, 0.06);
      event = c.hail && rng.chance(0.5) ? 'hail' : c.downburst && rng.chance(0.5) ? 'damage' : c.maxDbz > 50 && rng.chance(0.4) ? 'waterlogging' : 'lightning';
    }
  }
  const { town, km } = nearestTown(lng, lat);
  const base = {
    id: `CR-${String(rid).padStart(4, '0')}`,
    t,
    lng,
    lat,
    event,
    text: TEXTS[event][(rid * 7 + Math.floor(Math.abs(lng) * 1000)) % TEXTS[event].length],
    place: km < 15 ? town.name : `${Math.round(km)} km from ${town.name}`,
    source: rng.pick(['app', 'whatsapp', 'sms'] as const),
  };
  return verifyReport(base, strikes, cells, existing);
}

export function nextReportId() {
  rid++;
  return `CR-${String(rid).padStart(4, '0')}`;
}
export function resetReportIds() {
  rid = 0;
}
