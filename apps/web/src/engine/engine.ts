import type {
  CitizenReport,
  DirectorCommand,
  EngineEvent,
  EnvProfile,
  GridField,
  LeadBand,
  LightningStrike,
  MultiTaskProbs,
  NowcastFrame,
  PointNowcast,
  Scenario,
  Severity,
  StormCell,
  StormType,
  WorldSnapshot,
} from '@vajra/contracts';
import { Rng, makeNoise } from './prng';
import { SCENARIOS, scenarioById } from './scenarios';
import { type CellAgent, envelope, forecastTrack, makeCell, moveCell, recordHistory, resetCellCounter, sampleAndDetectJump, updatePhysics } from './cells';
import { Grid, advect, blockMatch, downsample, neighbourhoodProb, renderCtt, renderDbz, type MotionField } from './fields';
import { explain, predict } from './model';
import { classifyRegime } from './regime';
import { AlertManager, severityOf } from './alerts';
import { type SensorAgent, injectFault, makeSensors, radarCoverage, stepSensors } from './sensors';
import { maybeCrowdReport, nextReportId, resetReportIds, verifyReport } from './reports';
import { inIndia } from './places';
import { LEADS, Verifier } from './verification';
import { clamp, distanceKm, istHour, moveKm } from './geo';

export const TICK_MS = 250;
/** 1x = demo live rate: 30 simulated seconds per real second (1 sim-minute every 2 s). */
export const LIVE_RATE = 30;
const FINE_KM = 2;
const NC_F = 2; // nowcast grid = 4 km
const VER_F = 4; // verification grid = 8 km
const NWP_F = 6; // NWP = 12 km
const NC_LEADS = [15, 30, 45, 60, 90, 120, 150, 180, 270];
const BANDS: { band: LeadBand; leads: number[]; mid: number }[] = [
  { band: '0-30', leads: [15, 30], mid: 15 },
  { band: '30-60', leads: [45, 60], mid: 45 },
  { band: '60-120', leads: [90, 120], mid: 90 },
  { band: '120-180', leads: [150, 180], mid: 150 },
  { band: '180-360', leads: [270], mid: 270 },
];

interface HistFrame {
  t: number;
  dbz: Float32Array;
  cells: { id: string; lng: number; lat: number; maxDbz: number; radiusKm: number; severity: Severity; stage: CellAgent['stage']; type: StormType }[];
}

export interface FrameAt {
  t: number;
  offsetMin: number;
  dbz: GridField;
  cells: HistFrame['cells'];
  kind: 'past' | 'now' | 'forecast';
}

export class World {
  sc!: Scenario;
  seed = 20260726;
  seedLocked = false;
  speed = 1;
  paused = false;
  t = 0;
  tick = 0;
  rng!: Rng;
  noise!: ReturnType<typeof makeNoise>;
  cells: CellAgent[] = [];
  strikes: LightningStrike[] = [];
  strikeSeq = 0;
  strikesTotal = 0;
  grid!: Grid;
  ncGrid!: Grid;
  verGrid!: { w: number; h: number };
  dbz!: Float32Array;
  ctt!: Float32Array;
  density!: Float32Array;
  densityGrid!: Grid;
  districtCounts = new Map<string, number>();
  nwp!: Float32Array;
  nwpGrid!: Grid;
  confidence!: Float32Array;
  confGrid!: Grid;
  motion: MotionField | null = null;
  nowcast: NowcastFrame[] = [];
  history: HistFrame[] = [];
  coarseHist: { t: number; d: Float32Array }[] = [];
  alerts = new AlertManager();
  sensors: SensorAgent[] = [];
  reports: CitizenReport[] = [];
  verifier!: Verifier;
  events: EngineEvent[] = [];
  eventSeq = 0;
  probs = new Map<string, MultiTaskProbs>();
  scheduled: { at: number; lng: number; lat: number; type: StormType; strength: number }[] = [];
  lastNowcastAt = 0;
  lastSensorAt = 0;
  lastCttAt = 0;
  lastVerIssueAt = 0;
  lastConfAt = 0;
  lastNwpAt = 0;
  lastHistAt = 0;
  bustAssigned = false;
  lastTickMs = 0;
  dirty = { nowcast: true, ctt: true, conf: true, nwp: true, density: true };

  constructor(scenarioId = SCENARIOS[0].id) {
    this.load(scenarioId);
  }

  load(id: string) {
    this.sc = scenarioById(id);
    if (!this.seedLocked) this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    this.rng = new Rng(this.seed);
    this.noise = makeNoise(this.seed);
    resetCellCounter();
    resetReportIds();
    this.cells = [];
    this.strikes = [];
    this.strikesTotal = 0;
    this.events = [];
    this.reports = [];
    this.alerts = new AlertManager();
    this.history = [];
    this.coarseHist = [];
    this.districtCounts.clear();
    this.bustAssigned = false;
    this.grid = new Grid(this.sc.bbox, FINE_KM);
    this.ncGrid = new Grid(this.sc.bbox, FINE_KM * NC_F);
    this.confGrid = new Grid(this.sc.bbox, FINE_KM * VER_F);
    this.nwpGrid = new Grid(this.sc.bbox, FINE_KM * NWP_F);
    this.densityGrid = new Grid(this.sc.bbox, 5);
    this.dbz = new Float32Array(this.grid.w * this.grid.h);
    this.ctt = new Float32Array(this.ncGrid.w * this.ncGrid.h);
    this.density = new Float32Array(this.densityGrid.w * this.densityGrid.h);
    this.confidence = new Float32Array(this.confGrid.w * this.confGrid.h).fill(1);
    this.nwp = new Float32Array(this.nwpGrid.w * this.nwpGrid.h);
    const vw = Math.floor(this.grid.w / VER_F);
    const vh = Math.floor(this.grid.h / VER_F);
    this.verGrid = { w: vw, h: vh };
    this.verifier = new Verifier(vw, vh);
    this.sensors = makeSensors(this.rng.fork(7), this.sc.center, this.sc.bbox);
    // "now" is the scenario start hour on a fixed date in the scenario month (IST)
    const now = Date.UTC(2026, this.sc.month - 1, 14, 0, 0, 0) + (this.sc.startHourIST - 5.5) * 3600e3;
    const SPIN = 210; // minutes of history spun up before "now"
    this.t = now - SPIN * 60000;
    this.lastNowcastAt = this.lastSensorAt = this.lastCttAt = this.lastVerIssueAt = this.lastConfAt = this.lastNwpAt = this.lastHistAt = -Infinity;
    this.scheduled = this.sc.cells.map((c) => ({ at: now + (c.delayMin - 30) * 60000, lng: c.lng, lat: c.lat, type: c.type, strength: c.strength }));
    // spin-up in 1-minute steps (fast path)
    for (let m = 0; m < SPIN; m++) this.step(60000, true);
    this.pushEvent('director', `Scenario loaded: ${this.sc.name} (seed ${this.seed})`);
    this.dirty = { nowcast: true, ctt: true, conf: true, nwp: true, density: true };
  }

  pushEvent(kind: EngineEvent['kind'], text: string, severity?: Severity, cellId?: string) {
    this.events.push({ id: ++this.eventSeq, t: this.t, kind, text, severity, cellId });
    if (this.events.length > 120) this.events.shift();
  }

  /** environment sampled from noise fields around scenario means */
  envAt(lng: number, lat: number, c?: CellAgent): EnvProfile {
    const { n3 } = this.noise;
    const tm = this.t / (180 * 60000);
    const hr = istHour(this.t);
    const diurnal = clamp(0.55 + 0.45 * Math.sin(((hr - 9) / 24) * Math.PI * 2), 0.2, 1);
    const cape = clamp(this.sc.cape * (0.75 + 0.35 * n3(lng * 0.8, lat * 0.8, tm)) * (0.6 + 0.5 * diurnal), 150, 5200);
    const stage = c?.stage;
    const convergence = clamp(2 + n3(lng * 1.7, lat * 1.7, tm * 2) * 2.5 + (stage === 'growth' || stage === 'initiation' ? 3.5 : stage === 'decay' ? -2.5 : 0.8), -4, 10);
    return {
      capeJkg: cape,
      cinJkg: -clamp(25 + 60 * (0.5 - n3(lng * 1.3 + 9, lat * 1.3, tm)) * (1.2 - diurnal), 0, 180),
      shear06: clamp(this.sc.shear + 5 * n3(lng * 0.6 + 3, lat * 0.6, tm), 3, 32),
      pwMm: clamp(this.sc.pw + 7 * n3(lng * 0.9 + 5, lat * 0.9, tm), 15, 75),
      iwvRise: clamp(1 + 1.4 * n3(lng * 2 + 11, lat * 2, tm * 3) + (stage === 'growth' || stage === 'initiation' ? 1.6 : stage === 'decay' ? -1 : 0.3), -2, 6),
      convergence,
    };
  }

  spawn(lng: number, lat: number, type: StormType, strength: number, injected = false) {
    const c = makeCell(this.rng, this.t, lng, lat, type, strength, this.sc, injected);
    this.cells.push(c);
    this.pushEvent('cell_new', `New ${type} cell ${c.id} initiated`, undefined, c.id);
    return c;
  }

  private spawnRandom(dtMin: number) {
    const hr = istHour(this.t);
    const diurnal = clamp(Math.sin(((hr - 10) / 12) * Math.PI), 0.1, 1);
    const lambda = (this.sc.spawnRatePerHour / 60) * dtMin * diurnal;
    const k = this.rng.poisson(lambda);
    for (let i = 0; i < k; i++) {
      if (this.cells.length > 26) return;
      // initiation prefers unstable, converging air (sample a few candidates, keep the best)
      let best: [number, number] = [0, 0];
      let bs = -Infinity;
      const [w, s, e, n] = this.sc.bbox;
      for (let q = 0; q < 14; q++) {
        const lng = this.rng.range(w + 0.3, e - 0.3);
        const lat = this.rng.range(s + 0.3, n - 0.3);
        const env = this.envAt(lng, lat);
        const near = this.cells.some((c) => distanceKm(c.lng, c.lat, lng, lat) < 30);
        if (!inIndia(lng, lat)) continue;
        const score = env.capeJkg / 600 + env.convergence / 3 - (near ? 5 : 0);
        if (score > bs) {
          bs = score;
          best = [lng, lat];
        }
      }
      const r = this.rng.f();
      const type: StormType = r < 0.62 ? 'pulse' : r < 0.9 ? 'multicell' : this.sc.shear > 15 ? 'supercell' : 'multicell';
      this.spawn(best[0], best[1], type, this.rng.range(0.35, 0.85));
    }
  }

  private lightning(c: CellAgent, dtMin: number) {
    const n = Math.min(400, this.rng.poisson(c.flashRate * dtMin));
    // IC:CG ~ 3.5:1 in Indian pre-monsoon storms; +CG share rises in decaying / stratiform regions
    const cgShare = c.type === 'squall' ? 0.27 : 0.22;
    const posShare = c.stage === 'decay' ? 0.22 : c.type === 'supercell' ? 0.15 : 0.08;
    const anvil = moveKm(c.lng, c.lat, (this.sc.steeringDeg + 15) % 360, c.radiusKm * 1.2);
    for (let i = 0; i < n; i++) {
      const cg = this.rng.chance(cgShare);
      const pol: 1 | -1 = cg && this.rng.chance(posShare) ? 1 : -1;
      const spread = cg ? c.radiusKm * 0.55 : c.radiusKm * 0.9;
      const cx = cg ? c.lng : (c.lng + anvil[0]) / 2;
      const cy = cg ? c.lat : (c.lat + anvil[1]) / 2;
      const [lng, lat] = moveKm(cx, cy, this.rng.range(0, 360), Math.abs(this.rng.normal(0, spread)));
      const kA = cg ? (pol > 0 ? this.rng.logNormal(35, 0.6) : this.rng.logNormal(24, 0.5)) : this.rng.logNormal(8, 0.5);
      const s: LightningStrike = {
        id: ++this.strikeSeq,
        t: this.t - this.rng.range(0, dtMin * 60000),
        lng,
        lat,
        kind: cg ? 'CG' : 'IC',
        polarity: pol,
        peakKa: Math.round(kA * 10) / 10,
        cellId: c.id,
      };
      this.strikes.push(s);
      this.strikesTotal++;
      if (cg) {
        const gx = Math.round(this.densityGrid.i(lng));
        const gy = Math.round(this.densityGrid.j(lat));
        if (gx >= 0 && gy >= 0 && gx < this.densityGrid.w && gy < this.densityGrid.h) this.density[gy * this.densityGrid.w + gx] += 1;
      }
    }
  }

  /** main simulation step */
  step(dtMs: number, spin = false) {
    const t0 = performance.now();
    this.t += dtMs;
    this.tick++;
    const dtMin = dtMs / 60000;
    // scheduled scenario cells
    for (const s of this.scheduled.filter((x) => x.at <= this.t)) this.spawn(s.lng, s.lat, s.type, s.strength);
    this.scheduled = this.scheduled.filter((x) => x.at > this.t);
    this.spawnRandom(dtMin);
    // agents
    for (const c of this.cells) {
      const env = this.envAt(c.lng, c.lat, c);
      updatePhysics(c, this.t, dtMin, env, this.rng, this.lightningFactor());
      moveCell(c, dtMin, this.sc, this.noise.n2, this.t);
      if (sampleAndDetectJump(c, this.t)) this.pushEvent('jump', `Lightning jump in ${c.id}: +${c.jumpSigma.toFixed(1)} sigma, ${c.flashRate.toFixed(0)} fl/min - severe weather likely in 10-30 min`, 'orange', c.id);
      recordHistory(c, this.t);
      this.lightning(c, dtMin);
      const { ageMin } = envelope(c, this.t);
      if (ageMin > c.growthMin + c.matureMin + c.decayMin) c.dead = true;
      const [w, s, e, n] = this.sc.bbox;
      if (c.lng < w - 0.5 || c.lng > e + 0.5 || c.lat < s - 0.5 || c.lat > n + 0.5) c.dead = true;
    }
    this.splitMerge();
    for (const c of this.cells.filter((x) => x.dead)) this.pushEvent('cell_dead', `Cell ${c.id} dissipated`, undefined, c.id);
    this.cells = this.cells.filter((c) => !c.dead);
    // strikes: keep 30 min
    const cutoff = this.t - 30 * 60000;
    if (this.strikes.length && this.strikes[0].t < cutoff) this.strikes = this.strikes.filter((s) => s.t >= cutoff);
    if (this.strikes.length > 12000) this.strikes = this.strikes.slice(-12000);
    // density decays with an e-folding time of 6 h
    if (this.tick % 20 === 0) {
      const f = Math.exp(-(dtMin * 20) / 360);
      for (let k = 0; k < this.density.length; k++) this.density[k] *= f;
      this.dirty.density = true;
    }
    // model + alerts
    this.probs.clear();
    for (const c of this.cells) this.probs.set(c.id, predict(c));
    this.assignBust();
    this.alerts.step(this.cells, this.probs, this.sc, this.t, dtMs / 1000, this.rng, (text, sev, cellId, kind) => this.pushEvent(kind, text, sev, cellId));
    for (const a of this.alerts.alerts) if (a.status === 'expired' && this.bustIds.has(a.cellId)) a.falseAlarm = true;
    // radar mosaic (masked where the covering radar is excluded)
    const excluded = this.sensors.filter((s) => s.kind === 'dwr' && s.state === 'excluded');
    const mask = excluded.length ? (lng: number, lat: number) => (radarCoverage(this.sensors, lng, lat) < 0.3 ? 0.55 : 1) : undefined;
    renderDbz(this.grid, this.cells, this.dbz, this.noise.n3, this.t / 60000, mask);
    // 5-min cadence products
    if (this.t - this.lastHistAt >= 5 * 60000) {
      this.lastHistAt = this.t;
      this.history.push({ t: this.t, dbz: this.dbz.slice(), cells: this.cellsLite() });
      while (this.history.length && this.history[0].t < this.t - 125 * 60000) this.history.shift();
      const coarse = downsample(this.dbz, this.grid.w, this.grid.h, NC_F).data;
      this.coarseHist.push({ t: this.t, d: coarse });
      if (this.coarseHist.length > 4) this.coarseHist.shift();
      this.computeNowcast(coarse);
      this.verify();
    }
    if (!spin || this.tick % 3 === 0) {
      if (this.t - this.lastCttAt >= 2 * 60000) {
        this.lastCttAt = this.t;
        renderCtt(this.ncGrid, this.cells, this.ctt, this.noise.n3, this.t / 60000, (this.sc.steeringDeg + 15) % 360);
        this.dirty.ctt = true;
      }
    }
    if (this.t - this.lastSensorAt >= 60000) {
      const n = Math.max(1, Math.round((this.t - Math.max(this.lastSensorAt, this.t - 5 * 60000)) / 60000));
      this.lastSensorAt = this.t;
      for (let k = 0; k < n; k++) stepSensors(this.sensors, this.t, this.rng, (lng, lat) => this.tempAt(lng, lat), (s, text) => this.pushEvent('sensor', text, s.state === 'excluded' ? 'orange' : 'green'));
    }
    if (this.t - this.lastConfAt >= 5 * 60000) this.computeConfidence();
    if (this.t - this.lastNwpAt >= 15 * 60000) this.computeNwp();
    const rep = maybeCrowdReport(this.rng, this.t, this.cells, this.strikes, this.reports, this.sc.bbox, 0.25 * clamp(this.cells.filter((c) => c.maxDbz > 45).length / 3, 0.2, 2), dtMin);
    if (rep) {
      this.reports.push(rep);
      if (this.reports.length > 150) this.reports.shift();
      if (!spin) this.pushEvent('report', `Citizen report ${rep.id}: ${rep.event} at ${rep.place} -> ${rep.status.toUpperCase()}`, rep.status === 'verified' ? 'yellow' : undefined);
    }
    this.lastTickMs = performance.now() - t0;
  }

  /** continental pre-monsoon storms are lightning-rich; maritime monsoon cells are not (IITM LLN climatology) */
  lightningFactor() {
    const f = { premonsoon_norwester: 1.25, monsoon_convection: 0.55, western_disturbance: 0.8, postmonsoon_nem: 0.7, nw_dust_thunder: 0.9 }[this.sc.regime];
    return this.sc.landUse === 'farmland' ? f * 1.15 : f;
  }

  private bustIds = new Set<string>();
  /** built-in imperfection: one storm per session is forecast to grow but collapses (a real false alarm). */
  private assignBust() {
    if (this.bustAssigned) return;
    const cand = this.cells.find((c) => c.type === 'pulse' && c.stage === 'growth' && (this.probs.get(c.id)?.thunderstorm ?? 0) > 0.45 && !c.injected);
    if (cand && this.alerts.alerts.length >= 2) {
      this.bustAssigned = true;
      this.bustIds.add(cand.id);
      cand.matureMin = 3;
      cand.decayMin = 12;
      cand.strength *= 0.85;
    }
  }

  private tempAt(lng: number, lat: number) {
    // surface temperature: hot pre-storm, cold-pool drop of up to 10 K under strong cores
    const base = this.sc.month >= 6 && this.sc.month <= 9 ? 30 : 36;
    let drop = 0;
    for (const c of this.cells) {
      const d = distanceKm(lng, lat, c.lng, c.lat);
      if (d < c.radiusKm * 3) drop = Math.max(drop, 10 * c.intensity * (1 - d / (c.radiusKm * 3)));
    }
    return base + this.noise.n2(lng, lat) * 1.5 - drop;
  }

  private splitMerge() {
    // merge: cores overlapping by > 40% -> the stronger absorbs the weaker
    for (let i = 0; i < this.cells.length; i++)
      for (let j = i + 1; j < this.cells.length; j++) {
        const a = this.cells[i];
        const b = this.cells[j];
        if (a.dead || b.dead) continue;
        const d = distanceKm(a.lng, a.lat, b.lng, b.lat);
        if (d < (a.radiusKm + b.radiusKm) * 0.6 && a.intensity > 0.2 && b.intensity > 0.2) {
          const [big, small] = a.intensity >= b.intensity ? [a, b] : [b, a];
          small.dead = true;
          big.strength = Math.min(1.2, big.strength + small.strength * 0.25);
          big.matureMin += 15;
          if (big.type === 'pulse') big.type = 'multicell';
          this.pushEvent('cell_merge', `Cells ${big.id} + ${small.id} merged -> ${big.id} (${big.type})`, undefined, big.id);
        }
      }
    // split: mature supercells/multicells occasionally split (left-mover)
    for (const c of [...this.cells]) {
      if (c.splitDone || c.stage !== 'mature' || (c.type !== 'supercell' && c.type !== 'multicell')) continue;
      if (this.rng.chance(0.004)) {
        c.splitDone = true;
        const [lng, lat] = moveKm(c.lng, c.lat, (c.headingDeg + 270) % 360, c.radiusKm * 1.4);
        const child = makeCell(this.rng, this.t, lng, lat, c.type === 'supercell' ? 'supercell' : 'multicell', c.strength * 0.7, this.sc);
        child.headingDeg = (c.headingDeg - 30 + 360) % 360;
        child.growthMin = 8;
        child.splitDone = true;
        this.cells.push(child);
        this.pushEvent('cell_split', `Cell ${c.id} split: new ${c.type === 'supercell' ? 'left-mover' : 'daughter cell'} ${child.id}`, undefined, child.id);
      }
    }
  }

  /** growth/decay term for the nowcast: dBZ change expected from each cell's lifecycle trend (model estimate, imperfect). */
  private growthTerm(lead: number, g: Grid, scale: number) {
    const fut = this.cells.map((c) => {
      const [lng, lat] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * lead) / 60);
      const now = envelope(c, this.t).I;
      // the model sees the trend, not the future: extrapolate the last 10 min, damped, saturating
      const h = c.history;
      const trend = h.length >= 6 ? (h[h.length - 1].maxDbz - h[h.length - 6].maxDbz) / 10 : 0;
      let d = trend * lead * Math.exp(-lead / 50);
      if (c.stage === 'mature') d -= (lead / 60) * (c.type === 'pulse' ? 7 : c.type === 'multicell' ? 3 : 1); // mature cells decay, organised ones slowly
      if (now < 0.1) d = 0;
      return { lng, lat, r: c.radiusKm * 2.5 + lead * 0.15, d: clamp(d, -25, 12) };
    });
    return (i: number, j: number) => {
      const lng = g.lng(i * scale);
      const lat = g.lat(j * scale);
      let best = 0;
      let bw = 0;
      for (const f of fut) {
        const dist = distanceKm(lng, lat, f.lng, f.lat);
        if (dist > f.r * 2) continue;
        const w = Math.exp(-(dist * dist) / (2 * f.r * f.r));
        if (w > bw) {
          bw = w;
          best = f.d * w;
        }
      }
      return best;
    };
  }

  private computeNowcast(coarse: Float32Array) {
    const g = this.ncGrid;
    const w = Math.floor(this.grid.w / NC_F);
    const h = Math.floor(this.grid.h / NC_F);
    const prev = this.coarseHist.length >= 3 ? this.coarseHist[this.coarseHist.length - 3] : null; // 10 min ago
    const steer = moveKm(0, 0, this.sc.steeringDeg, (this.sc.steeringKmh * 10) / 60);
    const fb: [number, number] = [steer[0] * 111.32 * Math.cos((this.sc.center[1] * Math.PI) / 180) / (FINE_KM * NC_F), -steer[1] * 111.32 / (FINE_KM * NC_F)];
    this.motion = prev ? blockMatch(prev.d, coarse, w, h, 8, 4, [Math.round(fb[0]), Math.round(fb[1])]) : blockMatch(coarse, coarse, w, h, 8, 0, fb);
    const fields = new Map<number, { dbz: Float32Array; prob: Float32Array }>();
    const hr = istHour(this.t);
    for (const lead of NC_LEADS) {
      const steps = lead / 10;
      const dbz = advect(coarse, w, h, this.motion, steps, 1, this.growthTerm(lead, this.grid, NC_F));
      const r = Math.round(1 + lead / 30);
      const p = neighbourhoodProb(dbz, w, h, 35, r);
      // convective-initiation term: unstable, converging air can produce new storms at longer leads
      const ciW = clamp((lead - 30) / 120, 0, 0.55) * clamp(Math.sin(((hr - 10) / 12) * Math.PI) + 0.2, 0, 1);
      if (ciW > 0) {
        for (let j = 0; j < h; j += 1)
          for (let i = 0; i < w; i += 1) {
            const lng = g.lng(i);
            const lat = g.lat(j);
            const e = this.noise.n3(lng * 0.8, lat * 0.8, (this.t + lead * 60000) / (180 * 60000));
            const ci = clamp((e - 0.3) * 1.6, 0, 1) * ciW;
            const k = j * w + i;
            p[k] = Math.max(p[k], ci);
          }
      }
      // calibration: slight shrink toward climatology (reliability)
      for (let k = 0; k < p.length; k++) p[k] = clamp(p[k] * 0.72 * (1 - lead / 1400), 0, 0.95);
      fields.set(lead, { dbz, prob: p });
    }
    this.nowcast = BANDS.map((b) => {
      const prob = new Float32Array(w * h);
      for (const L of b.leads) {
        const f = fields.get(L)!.prob;
        for (let k = 0; k < prob.length; k++) if (f[k] > prob[k]) prob[k] = f[k];
      }
      const dbz = fields.get(b.leads[b.leads.length - 1])!.dbz;
      const gf = (name: GridField['name'], data: Float32Array): GridField => ({ name, width: w, height: h, bbox: this.gridBbox(g, w, h), resKm: FINE_KM * NC_F, t: this.t, data });
      return { issuedAt: this.t, leadMin: b.mid, band: b.band, prob: gf('prob', prob), dbz: gf('dbz', dbz), extended: b.band === '180-360' };
    });
    this.ncFields = fields;
    this.lastNowcastAt = this.t;
    this.dirty.nowcast = true;
  }
  private ncFields = new Map<number, { dbz: Float32Array; prob: Float32Array }>();

  private gridBbox(g: Grid, w: number, h: number): [number, number, number, number] {
    return [g.bbox[0], g.bbox[3] - h * g.dLat, g.bbox[0] + w * g.dLng, g.bbox[3]];
  }

  private verify() {
    const obs = downsample(this.dbz, this.grid.w, this.grid.h, VER_F).data;
    this.verifier.verifyDue(this.t, obs);
    if (this.t - this.lastVerIssueAt < 10 * 60000 || !this.motion || this.coarseHist.length < 3) return;
    this.lastVerIssueAt = this.t;
    const w = Math.floor(this.grid.w / NC_F);
    const h = Math.floor(this.grid.h / NC_F);
    const coarse = this.coarseHist[this.coarseHist.length - 1].d;
    const ds = (a: Float32Array, mode: 'max' | 'mean') => downsample(a, w, h, VER_F / NC_F, mode).data;
    for (const lead of LEADS) {
      const nc = this.ncFields.get(lead);
      if (!nc) continue;
      this.verifier.issue(this.t, lead, 'vajra', ds(nc.dbz, 'max'), ds(nc.prob, 'mean'));
      const of = advect(coarse, w, h, this.motion, lead / 10, 1);
      this.verifier.issue(this.t, lead, 'optical_flow', ds(of, 'max'), new Float32Array(0));
      this.verifier.issue(this.t, lead, 'persistence', obs.slice(), new Float32Array(0));
    }
  }

  private computeConfidence() {
    this.lastConfAt = this.t;
    const g = this.confGrid;
    const obs = downsample(this.dbz, this.grid.w, this.grid.h, VER_F).data;
    const nwpAt = (lng: number, lat: number) => this.nwpGrid.sample(this.nwp, lng, lat);
    for (let j = 0; j < g.h; j++)
      for (let i = 0; i < g.w; i++) {
        const lng = g.lng(i);
        const lat = g.lat(j);
        const cov = radarCoverage(this.sensors, lng, lat);
        const env = this.envAt(lng, lat);
        const initRisk = clamp((env.capeJkg - 2200) / 2000, 0, 1) * clamp(env.convergence / 5, 0, 1);
        const k = j * g.w + i;
        const o = obs[Math.min(obs.length - 1, j * this.verGrid.w + i)] ?? 0;
        const dis = clamp(Math.abs(nwpAt(lng, lat) - o) / 35, 0, 1);
        this.confidence[k] = clamp(cov * (1 - 0.45 * initRisk) * (1 - 0.35 * dis), 0.05, 1);
      }
    this.dirty.conf = true;
  }

  /** 12 km NWP proxy: smooth, weaker, displaced and lagged version of truth plus spurious convection */
  private computeNwp() {
    this.lastNwpAt = this.t;
    const g = this.nwpGrid;
    const lagCells = this.cells.map((c) => {
      const [lng, lat] = moveKm(c.lng, c.lat, (this.sc.steeringDeg + 180 + 20) % 360, 28); // position/timing error
      return { lng, lat, r: c.radiusKm * 2.6 + 12, v: 18 + 30 * c.intensity };
    });
    for (let j = 0; j < g.h; j++)
      for (let i = 0; i < g.w; i++) {
        const lng = g.lng(i);
        const lat = g.lat(j);
        let v = 0;
        for (const c of lagCells) {
          const d = distanceKm(lng, lat, c.lng, c.lat);
          v = Math.max(v, c.v * Math.exp(-(d * d) / (2 * c.r * c.r)));
        }
        const spur = this.noise.n3(lng * 0.7 + 40, lat * 0.7, this.t / (240 * 60000));
        if (spur > 0.55) v = Math.max(v, 22 + (spur - 0.55) * 60);
        this.nwp[j * g.w + i] = v;
      }
    this.dirty.nwp = true;
  }

  private cellsLite(): HistFrame['cells'] {
    return this.cells.map((c) => {
      const p = this.probs.get(c.id);
      return { id: c.id, lng: c.lng, lat: c.lat, maxDbz: c.maxDbz, radiusKm: c.radiusKm, severity: p ? severityOf(p, c) : 'green', stage: c.stage, type: c.type };
    });
  }

  toContract(c: CellAgent): StormCell {
    const probs = this.probs.get(c.id) ?? predict(c);
    return {
      id: c.id,
      label: c.label,
      lng: c.lng,
      lat: c.lat,
      radiusKm: c.radiusKm,
      elongation: c.elongation,
      orientationDeg: c.orientationDeg,
      stage: c.stage,
      type: c.type,
      ageMin: (this.t - c.bornAt) / 60000,
      headingDeg: c.headingDeg,
      speedKmh: c.speedKmh,
      maxDbz: c.maxDbz,
      echoTopKm: c.echoTopKm,
      vil: c.vil,
      flashRate: c.flashRate,
      cttK: c.cttK,
      cttCoolingK15: c.cttCoolingK15,
      lightningJump: c.lightningJump,
      jumpSigma: c.jumpSigma,
      hail: c.hail,
      downburst: c.downburst,
      env: c.env,
      track: c.track.slice(),
      forecastTrack: forecastTrack(c, this.t, [0, 15, 30, 45, 60, 90, 120, 180]),
      history: c.history.slice(-45),
      probs,
      xai: explain(c, 'thunderstorm'),
      severity: severityOf(probs, c),
      injected: c.injected,
    };
  }

  snapshot(): WorldSnapshot & { changed: World["dirty"] } {
    const g = this.grid;
    const strikesRecent = this.strikes.filter((s) => s.t >= this.t - 20 * 60000);
    const lastMin = strikesRecent.filter((s) => s.t >= this.t - 60000).length;
    const cells = this.cells.map((c) => this.toContract(c));
    let pwS = 0;
    let shS = 0;
    let cpS = 0;
    const n = Math.max(1, cells.length);
    for (const c of cells) {
      pwS += c.env.pwMm;
      shS += c.env.shear06;
      cpS += c.env.capeJkg;
    }
    if (!cells.length) {
      const e = this.envAt(this.sc.center[0], this.sc.center[1]);
      pwS = e.pwMm;
      shS = e.shear06;
      cpS = e.capeJkg;
    }
    const changed = { ...this.dirty };
    this.dirty = { nowcast: false, ctt: false, conf: false, nwp: false, density: false };
    // lightning density ranking per district (CG last ~6 h, decayed)
    return {
      changed,
      stats: {
        tick: this.tick,
        tickMs: this.lastTickMs,
        simTime: this.t,
        speed: this.speed,
        seed: this.seed,
        cells: cells.length,
        strikesLastMin: lastMin,
        strikesTotal: this.strikesTotal,
        source: 'simulation',
        latencyMs: 0,
      },
      scenario: this.sc,
      cells,
      strikes: strikesRecent.length > 6000 ? strikesRecent.slice(-6000) : strikesRecent,
      dbz: g.field('dbz', this.t, this.dbz.slice()),
      ctt: this.ncGrid.field('ctt', this.t, this.ctt.slice()),
      nowcast: changed.nowcast ? this.nowcast : [],
      confidence: this.confGrid.field('confidence', this.t, this.confidence.slice()),
      nwp: this.nwpGrid.field('nwp', this.t, this.nwp.slice()),
      density: this.densityGrid.field('density', this.t, this.density.slice()),
      alerts: this.alerts.alerts.map((a) => ({ ...a, delivery: a.delivery.map((d) => ({ ...d })), areas: [...a.areas], polygon: a.polygon })),
      sensors: this.sensors.map(({ injected: _i, injectedUntil: _u, base: _b, driftAcc: _d, healedAt: _h, ...s }) => ({ ...s, series: s.series.slice() })),
      reports: this.reports.slice(),
      verification: this.verifier.summary(),
      regime: classifyRegime(this.sc, pwS / n, shS / n, cpS / n, istHour(this.t)),
      events: this.events.slice(-60),
    };
  }

  /** scrubber: -120..+180 min relative to now */
  frameAt(offsetMin: number): FrameAt {
    const g = this.grid;
    if (offsetMin <= -2.5) {
      const target = this.t + offsetMin * 60000;
      let best = this.history[0];
      for (const h of this.history) if (Math.abs(h.t - target) < Math.abs(best.t - target)) best = h;
      return { t: best.t, offsetMin, dbz: g.field('dbz', best.t, best.dbz.slice()), cells: best.cells, kind: 'past' };
    }
    if (offsetMin < 2.5 || !this.motion) return { t: this.t, offsetMin: 0, dbz: g.field('dbz', this.t, this.dbz.slice()), cells: this.cellsLite(), kind: 'now' };
    // forecast: advect the fine mosaic with the (coarse) motion field + growth/decay
    const fine = advect(this.dbz, g.w, g.h, this.motion, offsetMin / 10, NC_F, this.growthTerm(offsetMin, g, 1));
    const cells = this.cells.map((c) => {
      const [lng, lat] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * offsetMin) / 60);
      const I = envelope(c, this.t + offsetMin * 60000).I;
      const p = this.probs.get(c.id);
      return { id: c.id, lng, lat, maxDbz: clamp(18 + 47 * c.strength * I, 10, 70), radiusKm: c.radiusKm, severity: p ? severityOf(p, c) : ('green' as Severity), stage: c.stage, type: c.type };
    }).filter((c) => c.maxDbz > 22);
    return { t: this.t + offsetMin * 60000, offsetMin, dbz: g.field('dbz', this.t + offsetMin * 60000, fine), cells, kind: 'forecast' };
  }

  pointNowcast(lat: number, lon: number, leadMin: number): PointNowcast {
    const band = this.nowcast.find((b) => leadMin <= parseInt(b.band.split('-')[1], 10)) ?? this.nowcast[this.nowcast.length - 1];
    let probability = 0;
    if (band) {
      const gw = band.prob.width;
      const i = Math.round((lon - band.prob.bbox[0]) / ((band.prob.bbox[2] - band.prob.bbox[0]) / gw) - 0.5);
      const j = Math.round((band.prob.bbox[3] - lat) / ((band.prob.bbox[3] - band.prob.bbox[1]) / band.prob.height) - 0.5);
      if (i >= 0 && j >= 0 && i < gw && j < band.prob.height) probability = band.prob.data[j * gw + i];
    }
    // cells that will pass within their radius in the window
    let nearestCellId: string | null = null;
    let etaMin: number | null = null;
    let probs: MultiTaskProbs = { thunderstorm: probability, lightning: probability * 0.9, hail: 0.02, gust50: 0.05, heavyRain: probability * 0.6 };
    let sev: Severity = 'green';
    for (const c of this.cells) {
      for (let m = 0; m <= leadMin; m += 5) {
        const [lng, lat2] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * m) / 60);
        if (distanceKm(lon, lat, lng, lat2) < c.radiusKm * 2 + 6) {
          if (etaMin === null || m < etaMin) {
            etaMin = m;
            nearestCellId = c.id;
            const p = this.probs.get(c.id);
            if (p) {
              probs = p;
              sev = severityOf(p, c);
              probability = Math.max(probability, p.thunderstorm * (1 - m / 400));
            }
          }
          break;
        }
      }
    }
    let nearest: number | null = null;
    for (const s of this.strikes) {
      if (s.t < this.t - 15 * 60000) continue;
      const d = distanceKm(lon, lat, s.lng, s.lat);
      if (nearest === null || d < nearest) nearest = d;
    }
    return { lat, lon, leadMin, probability: clamp(probability, 0, 0.99), probs, nearestStrikeKm: nearest, nearestCellId, etaMin, severity: sev };
  }

  districtRanking() {
    // CG strike counts by nearest district over the retained window
    const counts = new Map<string, { name: string; state: string; n: number; peak: number }>();
    return counts;
  }

  command(cmd: DirectorCommand) {
    switch (cmd.type) {
      case 'scenario':
        this.load(cmd.id);
        break;
      case 'spawn': {
        const c = this.spawn(cmd.lng, cmd.lat, cmd.stormType, cmd.strength, true);
        c.bornAt = this.t - c.growthMin * 0.5 * 60000; // start mid-growth for instant drama
        this.pushEvent('director', `Director: spawned ${cmd.stormType} ${c.id}`, undefined, c.id);
        break;
      }
      case 'jump': {
        const c = cmd.cellId ? this.cells.find((x) => x.id === cmd.cellId) : [...this.cells].sort((a, b) => b.intensity - a.intensity)[0];
        if (c) {
          c.jumpBoost = 3.2;
          c.strength = Math.min(1.2, c.strength * 1.15);
          c.matureMin += 20;
          this.pushEvent('director', `Director: forced updraft pulse in ${c.id} (watch for a lightning jump)`, undefined, c.id);
        }
        break;
      }
      case 'speed':
        this.speed = cmd.value;
        break;
      case 'pause':
        this.paused = cmd.value;
        break;
      case 'seed':
        this.seed = cmd.value >>> 0;
        this.seedLocked = cmd.lock;
        this.load(this.sc.id);
        break;
      case 'reset':
        this.load(this.sc.id);
        break;
      case 'sensorFail': {
        const s = cmd.sensorId ? this.sensors.find((x) => x.id === cmd.sensorId) : this.sensors.filter((x) => x.kind === 'dwr').sort((a, b) => distanceKm(a.lng, a.lat, this.sc.center[0], this.sc.center[1]) - distanceKm(b.lng, b.lat, this.sc.center[0], this.sc.center[1]))[0];
        if (s) {
          injectFault(s, cmd.anomaly, this.t, this.rng);
          this.pushEvent('director', `Director: injected ${cmd.anomaly} fault into ${s.name}`);
        }
        break;
      }
      case 'report': {
        const r = verifyReport({ ...cmd.report, id: nextReportId() }, this.strikes, this.cells, this.reports);
        this.reports.push(r);
        this.pushEvent('report', `Citizen report ${r.id}: ${r.event} at ${r.place} -> ${r.status.toUpperCase()}`, r.status === 'verified' ? 'yellow' : undefined);
        return r;
      }
    }
    return null;
  }
}
