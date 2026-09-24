import type { Alert, Channel, DeliveryCounter, ImpactEstimate, LngLat, Scenario, Severity } from '@vajra/contracts';
import type { CellAgent } from './cells';
import type { Rng } from './prng';
import { convexHull, distanceKm, ellipse, fmtIST, istHour, moveKm, pointInPolygon } from './geo';
import { DISTRICTS, INFRA, TOWNS, blockAndPanchayat, inIndia } from './places';
import type { MultiTaskProbs } from '@vajra/contracts';

const SEV_RANK: Record<Severity, number> = { green: 0, yellow: 1, orange: 2, red: 3 };

/** IMD colour code from multi-task probabilities + hazard flags. */
export function severityOf(p: MultiTaskProbs, c: CellAgent): Severity {
  const hazard = c.hail || c.downburst || c.lightningJump || c.flashRate > 25 || p.gust50 > 0.6;
  if (p.thunderstorm >= 0.7 && hazard && c.maxDbz >= 52) return 'red';
  if (p.thunderstorm >= 0.55 && c.maxDbz >= 45) return 'orange';
  if (p.thunderstorm >= 0.45 && c.maxDbz >= 40) return 'yellow';
  return 'green';
}

/** Warning polygon: hull of the cell's footprint along its 0-60 min forecast track, widened with lead time. */
export function warningPolygon(c: CellAgent): LngLat[] {
  const pts: [number, number][] = [];
  for (const m of [0, 15, 30, 45]) {
    const [lng, lat] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * m) / 60);
    const grow = 1 + m / 90;
    const a = (c.radiusKm * Math.sqrt(c.elongation) + 8) * grow;
    const b = (c.radiusKm / Math.sqrt(c.elongation) + 8) * grow;
    pts.push(...ellipse(lng, lat, a, b, c.orientationDeg, 12));
  }
  return convexHull(pts) as LngLat[];
}

function polyAreaKm2(poly: LngLat[]): number {
  const lat0 = poly[0][1];
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  let a = 0;
  for (let i = 0; i < poly.length - 1; i++) a += poly[i][0] * kx * poly[i + 1][1] * 111.32 - poly[i + 1][0] * kx * poly[i][1] * 111.32;
  return Math.abs(a / 2);
}

function ruralDensity(sc: Scenario) {
  return sc.landUse === 'farmland' ? 1050 : sc.landUse === 'urban' ? 900 : sc.landUse === 'coastal' ? 520 : 800;
}

/** fraction of farm workers in the field by IST hour */
function fieldFraction(h: number) {
  if (h < 5.5 || h > 19.5) return 0.02;
  if (h < 11) return 0.55;
  if (h < 13) return 0.35;
  if (h < 17.5) return 0.48;
  return 0.25;
}

export function estimateImpact(alertId: string, poly: LngLat[], sc: Scenario, t: number, rng: Rng): ImpactEstimate {
  const area = polyAreaKm2(poly);
  const h = istHour(t);
  let urbanPop = 0;
  let agriW = 0;
  for (const town of TOWNS) {
    if (pointInPolygon(town.lng, town.lat, poly as [number, number][])) {
      urbanPop += town.pop;
      agriW += town.pop * town.agri;
    }
  }
  const rural = area * ruralDensity(sc) * 0.5;
  const pop = Math.round(urbanPop + rural);
  const agriShare = sc.landUse === 'farmland' ? 0.52 : sc.landUse === 'coastal' ? 0.38 : sc.landUse === 'mixed' ? 0.33 : 0.08;
  const farmers = Math.round((rural * agriShare * 0.45 + agriW * 0.3) * fieldFraction(h));
  const day = new Date(t + 5.5 * 3600e3).getUTCDay();
  const inSession = day !== 0 && h >= 7.5 && h < 14.5;
  const schools = Math.round(area / 9 + urbanPop / 4000);
  const inside = (x: { lng: number; lat: number }) => pointInPolygon(x.lng, x.lat, poly as [number, number][]);
  const infra = INFRA.filter(inside);
  const ports = infra.filter((i) => i.kind === 'port').length;
  const coastal = sc.landUse === 'coastal' || sc.id.includes('mumbai') || sc.id.includes('kolkata');
  return {
    alertId,
    population: pop,
    farmersInField: farmers,
    schoolsInSession: inSession ? schools : 0,
    students: inSession ? schools * 310 : 0,
    airports: infra.filter((i) => i.kind === 'airport').map((i) => i.name),
    highwaysKm: Math.round(infra.filter((i) => i.kind === 'highway').reduce((a, i) => a + (i.km ?? 0) * 0.4, 0) + area / 60),
    substations: infra.filter((i) => i.kind === 'substation').length + Math.floor(area / 1400),
    fishingBoats: ports * rng.int(120, 260) + (coastal ? Math.round(area / 90) : 0),
    hospitals: Math.round(urbanPop / 60000 + area / 700),
  };
}

const CHANNELS: Channel[] = ['sms', 'whatsapp', 'push', 'siren', 'cap'];

function initDelivery(pop: number): DeliveryCounter[] {
  const phones = pop * 0.82;
  return CHANNELS.map((ch) => ({
    channel: ch,
    target:
      ch === 'sms'
        ? Math.round(phones)
        : ch === 'whatsapp'
          ? Math.round(phones * 0.46)
          : ch === 'push'
            ? Math.round(phones * 0.12)
            : ch === 'siren'
              ? Math.max(1, Math.round(pop / 90000))
              : 1,
    sent: 0,
    delivered: 0,
    failed: 0,
  }));
}

/** advance delivery counters: SMS ~ 25k/s across operators, WhatsApp slower, sirens instant, CAP instant */
export function stepDelivery(a: Alert, dtSec: number, rng: Rng) {
  for (const d of a.delivery) {
    const rate = d.channel === 'sms' ? 25000 : d.channel === 'whatsapp' ? 9000 : d.channel === 'push' ? 40000 : 1e9;
    const add = Math.min(d.target - d.sent, Math.round(rate * dtSec * rng.range(0.7, 1.2)));
    d.sent += add;
    const failP = d.channel === 'sms' ? 0.018 : d.channel === 'whatsapp' ? 0.03 : d.channel === 'push' ? 0.06 : 0;
    const f = Math.round(add * failP);
    d.failed += f;
    d.delivered = Math.min(d.sent - d.failed, d.delivered + add - f);
  }
}

/** small deterministic string hash: picks phrasings so bulletins vary but stay reproducible */
function h32(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const OPEN = [(v: string) => `${v} is very likely`, (v: string) => `Expect ${v}`, (v: string) => `${v} is forecast`];
const ACTION = [
  'Stay indoors, keep away from open fields, lone trees and water bodies; follow the 30-30 rule. Farmers: stop field work now.',
  'Move into a pucca building now. Do not shelter under trees or near electric poles. Wait 30 minutes after the last thunder.',
  'Suspend outdoor work and travel if possible. Keep clear of tall objects and metal structures; resume 30 minutes after the last thunder.',
];

export function buildBulletin(a: Omit<Alert, 'bulletin'>, c: CellAgent, t: number): string {
  const hz: string[] = ['thunderstorm with lightning'];
  if (c.downburst || a.hazard === 'squall') hz.push('squall/gusty winds 50-70 km/h, gusting to 80 km/h');
  if (c.hail) hz.push('hail');
  if (a.hazard === 'heavy_rain') hz.push('intense rain (>15 mm/h)');
  const imp = a.impact;
  const k = h32(`${a.id}:${Math.floor(t / 600000)}`);
  const hazardText = hz.join(', ').replace(/^./, (x) => x.toUpperCase());
  const where = a.areas
    .filter((x) => x.level !== 'state')
    .map((x) => x.name)
    .slice(0, 4)
    .join(', ');
  const window = Math.max(10, a.etaMin + 30);
  const lines = [
    `NOWCAST WARNING (${a.severity.toUpperCase()}) — ${a.id}`,
    `Issued ${fmtIST(t)} IST, valid till ${fmtIST(a.expiresAt)} IST.`,
    `${OPEN[k % 3](hazardText)} over ${where} (${a.district}, ${a.state}) ${k % 2 ? 'in the next' : 'during the next'} ${window} minutes.`,
    `Storm ${c.id} (${c.type}) ${k % 2 ? 'is moving' : 'moves'} ${compass(c.headingDeg)} at ${c.speedKmh.toFixed(0)} km/h: max ${c.maxDbz.toFixed(1)} dBZ, echo tops ${c.echoTopKm.toFixed(1)} km, ${c.flashRate.toFixed(1)} flashes/min${c.lightningJump ? ' with a LIGHTNING JUMP (+' + c.jumpSigma.toFixed(1) + 'σ)' : ''}.`,
    `Exposure: ~${fmtN(imp.population)} people, ${fmtN(imp.farmersInField)} farm workers outdoors${imp.schoolsInSession ? `, ${imp.schoolsInSession} schools in session` : ''}${imp.airports.length ? `, airports: ${imp.airports.join(', ')}` : ''}.`,
    `Action: ${ACTION[(k >>> 3) % 3]}`,
  ];
  return lines.join('\n');
}

export const compass = (deg: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((deg % 360) / 22.5) % 16];
export const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`);

/**
 * Alert manager with the alert-fatigue guard:
 *  - one live alert per storm; upgrades/downgrades update the same alert (no new SMS for downgrades)
 *  - a new alert whose polygon centroid falls inside an active alert of equal or higher severity is MERGED
 *  - re-issue of the same severity within 20 min is SUPPRESSED (counted, not sent)
 *  - alerts expire 20 min after the storm drops below yellow
 */
export class AlertManager {
  alerts: Alert[] = [];
  private seq = 0;
  private lastIssue = new Map<string, { t: number; sev: Severity }>();

  step(
    cells: CellAgent[],
    probs: Map<string, MultiTaskProbs>,
    sc: Scenario,
    t: number,
    dtSec: number,
    rng: Rng,
    onEvent: (text: string, sev: Severity, cellId: string, kind: 'alert' | 'alert_update') => void,
  ) {
    for (const c of cells) {
      const p = probs.get(c.id);
      if (!p || c.dead) continue;
      const sev = severityOf(p, c);
      let a = this.alerts.find((x) => x.cellId === c.id && x.status !== 'expired' && x.status !== 'merged');
      if (a?.status === 'suppressed') {
        // safety override: a suppressed warning comes back if the storm reaches RED
        if (sev === 'red' && a.severity !== 'red') {
          a.status = 'updated';
          a.severity = 'red';
          a.updatedAt = t;
          a.issuedBy = 'auto';
          onEvent(`${a.id} suppression overridden: storm reached RED`, 'red', c.id, 'alert_update');
        }
        continue;
      }
      if (sev === 'green') {
        if (a && t > a.updatedAt + 20 * 60000) a.status = 'expired';
        continue;
      }
      const poly = warningPolygon(c);
      if (!a) {
        // only warn for Indian territory (storm now or within 30 min)
        const ahead = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * 30) / 60);
        if (!inIndia(c.lng, c.lat) && !inIndia(ahead[0], ahead[1])) continue;
        // fatigue guard: merge into an overlapping alert
        const cen = centroid(poly);
        const host = this.alerts.find(
          (x) =>
            (x.status === 'active' || x.status === 'updated' || x.status === 'draft') &&
            SEV_RANK[x.severity] >= SEV_RANK[sev] &&
            pointInPolygon(cen[0], cen[1], x.polygon as [number, number][]),
        );
        if (host) {
          if (!host.mergedFrom.includes(c.id)) {
            host.mergedFrom.push(c.id);
            host.suppressed++;
          }
          continue;
        }
        const last = this.lastIssue.get(c.id);
        if (last && t - last.t < 20 * 60000 && SEV_RANK[last.sev] >= SEV_RANK[sev]) {
          continue;
        }
        a = this.create(c, p, sev, poly, sc, t, rng);
        this.alerts.push(a);
        this.lastIssue.set(c.id, { t, sev });
        onEvent(
          a.status === 'draft'
            ? `${sev.toUpperCase()} warning ${a.id} drafted for ${a.district} — awaiting forecaster (auto-issues in 3 min)`
            : `${sev.toUpperCase()} alert ${a.id} auto-issued for ${a.district}: ${a.headline}`,
          sev,
          c.id,
          'alert',
        );
      } else {
        const up = SEV_RANK[sev] > SEV_RANK[a.severity];
        const down = SEV_RANK[sev] < SEV_RANK[a.severity];
        if (up || (down && t - a.updatedAt > 10 * 60000)) {
          const prevSev = a.severity;
          a.severity = sev;
          if (a.status !== 'draft' || sev === 'red') a.status = 'updated';
          if (sev === 'red' && !a.issuedBy) a.issuedBy = 'auto';
          a.updatedAt = t;
          if (up) {
            a.impact = estimateImpact(a.id, poly, sc, t, rng);
            a.delivery = initDelivery(a.impact.population);
            this.lastIssue.set(c.id, { t, sev });
          }
          onEvent(`${a.id} ${up ? 'UPGRADED' : 'downgraded'} ${prevSev.toUpperCase()} -> ${sev.toUpperCase()} (${a.district})`, sev, c.id, 'alert_update');
        } else if (SEV_RANK[sev] === SEV_RANK[a.severity]) {
          a.suppressed += 0; // steady state: nothing re-sent
        }
        if (t - a.updatedAt > 2 * 60000 && !a.edited) {
          a.polygon = poly;
          a.updatedAt = t;
        }
        // human-in-the-loop with a timeout: drafts auto-issue after 3 min
        if (a.status === 'draft' && t - a.issuedAt > 3 * 60000) {
          a.status = 'active';
          a.issuedBy = 'auto';
          onEvent(`${a.id} auto-issued after 3 min without forecaster action`, a.severity, c.id, 'alert_update');
        }
        a.probability = p.thunderstorm;
        a.expiresAt = t + 90 * 60000;
        a.etaMin = etaToNearest(c);
        a.bulletin = buildBulletin(a, c, t);
      }
    }
    for (const a of this.alerts) {
      if (a.status === 'active' || a.status === 'updated') stepDelivery(a, dtSec, rng);
      const c = cells.find((x) => x.id === a.cellId);
      if ((!c || c.dead) && a.status !== 'expired' && a.status !== 'merged') {
        a.status = 'expired';
        onEvent(`${a.id} expired (storm ${a.cellId} dissipated)`, 'green', a.cellId, 'alert_update');
      }
    }
    // keep memory flat: keep last 40
    if (this.alerts.length > 40)
      this.alerts = this.alerts
        .filter((a) => a.status !== 'expired')
        .concat(this.alerts.filter((a) => a.status === 'expired').slice(-10))
        .slice(-40);
  }

  /** forecaster actions (Alert Center) */
  issue(id: string, t: number) {
    const a = this.alerts.find((x) => x.id === id);
    if (!a || (a.status !== 'draft' && a.status !== 'suppressed')) return null;
    a.status = 'active';
    a.issuedBy = 'forecaster';
    a.updatedAt = t;
    for (const d of a.delivery) {
      d.sent = 0;
      d.delivered = 0;
      d.failed = 0;
    }
    return a;
  }
  suppress(id: string, t: number) {
    const a = this.alerts.find((x) => x.id === id);
    if (!a || a.status === 'expired' || a.status === 'merged') return null;
    a.status = 'suppressed';
    a.suppressed++;
    a.updatedAt = t;
    return a;
  }
  merge(id: string, into: string, t: number) {
    const a = this.alerts.find((x) => x.id === id);
    const host = this.alerts.find((x) => x.id === into);
    if (!a || !host || a === host) return null;
    a.status = 'merged';
    a.mergedInto = host.id;
    a.updatedAt = t;
    if (!host.mergedFrom.includes(a.cellId)) host.mergedFrom.push(a.cellId);
    host.suppressed++;
    // host polygon grows to cover both warned areas
    host.polygon = convexHull([...host.polygon, ...a.polygon] as [number, number][]) as LngLat[];
    host.updatedAt = t;
    return host;
  }
  editPolygon(id: string, polygon: LngLat[], sc: Scenario, t: number, rng: Rng) {
    const a = this.alerts.find((x) => x.id === id);
    if (!a || polygon.length < 4) return null;
    const ring = polygon[0][0] === polygon[polygon.length - 1][0] && polygon[0][1] === polygon[polygon.length - 1][1] ? polygon : [...polygon, polygon[0]];
    a.polygon = ring;
    a.edited = true;
    a.updatedAt = t;
    a.impact = estimateImpact(a.id, ring, sc, t, rng);
    const scale = a.impact.population * 0.82;
    for (const d of a.delivery)
      if (d.channel === 'sms' || d.channel === 'whatsapp' || d.channel === 'push')
        d.target = Math.max(d.sent, Math.round(scale * (d.channel === 'sms' ? 1 : d.channel === 'whatsapp' ? 0.46 : 0.12)));
    return a;
  }

  private create(c: CellAgent, p: MultiTaskProbs, sev: Severity, poly: LngLat[], sc: Scenario, t: number, rng: Rng): Alert {
    this.seq++;
    const id = `VJ-${new Date(t + 5.5 * 3600e3).toISOString().slice(2, 10).replace(/-/g, '')}-${String(this.seq).padStart(3, '0')}`;
    const cen = centroid(poly);
    const bp = blockAndPanchayat(cen[0], cen[1]);
    const districts = DISTRICTS.filter((d) => pointInPolygon(d.lng, d.lat, poly as [number, number][])).slice(0, 5);
    const areas: Alert['areas'] = [
      { level: 'state', name: bp.state },
      ...(districts.length ? districts : [{ name: bp.district, state: bp.state }]).map((d) => ({ level: 'district' as const, name: d.name })),
      { level: 'block', name: bp.block },
      ...[...new Set([bp.panchayat, blockAndPanchayat(cen[0] + 0.07, cen[1] - 0.05).panchayat, blockAndPanchayat(cen[0] - 0.09, cen[1] + 0.04).panchayat])]
        .slice(0, 2)
        .map((name) => ({ level: 'panchayat' as const, name })),
    ];
    const hazard: Alert['hazard'] = c.hail
      ? 'hail'
      : c.type === 'squall' || c.downburst
        ? 'squall'
        : c.flashRate > 8
          ? 'lightning'
          : p.heavyRain > 0.75 && sc.pw > 55
            ? 'heavy_rain'
            : 'thunderstorm';
    const impact = estimateImpact(id, poly, sc, t, rng);
    const base: Omit<Alert, 'bulletin'> = {
      id,
      cellId: c.id,
      issuedAt: t,
      updatedAt: t,
      expiresAt: t + 90 * 60000,
      severity: sev,
      hazard,
      headline: `${hazardText(hazard)} — ${bp.block} and nearby (${compass(c.headingDeg)} at ${Math.round(c.speedKmh)} km/h)`,
      polygon: poly,
      areas,
      district: districts[0]?.name ?? bp.district,
      state: bp.state,
      etaMin: etaToNearest(c),
      probability: p.thunderstorm,
      impact,
      delivery: initDelivery(impact.population),
      status: sev === 'red' ? 'active' : 'draft',
      issuedBy: sev === 'red' ? 'auto' : null,
      edited: false,
      suppressed: 0,
      mergedFrom: [],
    };
    return { ...base, bulletin: buildBulletin(base, c, t) };
  }
}

export function hazardText(h: Alert['hazard']) {
  return {
    thunderstorm: 'Thunderstorm & lightning',
    lightning: 'Frequent lightning',
    hail: 'Hailstorm',
    squall: 'Squall / Kalbaisakhi winds',
    heavy_rain: 'Intense rain & lightning',
  }[h];
}

export function centroid(poly: LngLat[]): LngLat {
  let x = 0;
  let y = 0;
  const n = poly.length - 1 || 1;
  for (let i = 0; i < n; i++) {
    x += poly[i][0];
    y += poly[i][1];
  }
  return [x / n, y / n];
}

function etaToNearest(c: CellAgent): number {
  // minutes until the storm core reaches the nearest town ahead of it
  let best = 999;
  for (const town of TOWNS) {
    const d = distanceKm(c.lng, c.lat, town.lng, town.lat);
    if (d > 150) continue;
    for (let m = 0; m <= 180; m += 5) {
      const [lng, lat] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * m) / 60);
      if (distanceKm(lng, lat, town.lng, town.lat) < c.radiusKm + 5) {
        best = Math.min(best, m);
        break;
      }
    }
  }
  return best === 999 ? 0 : best;
}

/** CAP 1.2 (OASIS) XML, SACHET-style. */
export function capXml(a: Alert): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const iso = (t: number) => new Date(t + 5.5 * 3600e3).toISOString().replace(/\.\d{3}Z$/, '+05:30');
  const sevMap: Record<Severity, string> = { red: 'Extreme', orange: 'Severe', yellow: 'Moderate', green: 'Minor' };
  const urg: Record<Severity, string> = { red: 'Immediate', orange: 'Immediate', yellow: 'Expected', green: 'Future' };
  const poly = a.polygon.map(([lng, lat]) => `${lat.toFixed(4)},${lng.toFixed(4)}`).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${a.id}</identifier>
  <sender>vajra-nowcast@demo.local</sender>
  <sent>${iso(a.updatedAt)}</sent>
  <status>Exercise</status>
  <msgType>${a.status === 'updated' ? 'Update' : 'Alert'}</msgType>
  <scope>Public</scope>
  <info>
    <language>en-IN</language>
    <category>Met</category>
    <event>${esc(hazardText(a.hazard))}</event>
    <responseType>Shelter</responseType>
    <urgency>${urg[a.severity]}</urgency>
    <severity>${sevMap[a.severity]}</severity>
    <certainty>${a.probability > 0.7 ? 'Likely' : 'Possible'}</certainty>
    <effective>${iso(a.issuedAt)}</effective>
    <expires>${iso(a.expiresAt)}</expires>
    <senderName>VAJRA Nowcast Desk (prototype)</senderName>
    <headline>${esc(a.headline)}</headline>
    <description>${esc(a.bulletin)}</description>
    <instruction>Stay indoors. Avoid open fields, trees, water bodies and metal structures. Wait 30 minutes after the last thunder.</instruction>
    <parameter><valueName>ColourCode</valueName><value>${a.severity.toUpperCase()}</value></parameter>
    <parameter><valueName>Probability</valueName><value>${Math.round(a.probability * 100)}</value></parameter>
    <area>
      <areaDesc>${esc(a.areas.map((x) => x.name).join('; '))}</areaDesc>
      <polygon>${poly}</polygon>
    </area>
  </info>
</alert>`;
}
