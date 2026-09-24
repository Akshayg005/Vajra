import type { ContingencyScore, ReliabilityBin, VerificationScore, VerificationSummary } from '@vajra/contracts';
import { fss } from './fields';

export type Method = VerificationScore['method'];
export const LEADS = [30, 60, 120, 180];
const METHODS: Method[] = ['vajra', 'optical_flow', 'persistence'];

interface Pending {
  validAt: number;
  lead: number;
  method: Method;
  /** forecast dBZ (coarse) */
  dbz: Float32Array;
  /** forecast probability of >=35 dBZ (coarse) */
  prob: Float32Array;
}

interface Acc {
  table: ContingencyScore;
  brierSum: number;
  brierN: number;
  fssSum: number;
  fssN: number;
  n: number;
}

const THR = 35;

/** Standard categorical scores from a 2x2 contingency table (WWRP/WGNE JWGFVR definitions). */
export function categorical(t: ContingencyScore) {
  const { hits: H, misses: M, falseAlarms: F, correctNegatives: C } = t;
  const N = H + M + F + C;
  const hr = ((H + M) * (H + F)) / Math.max(1, N);
  return {
    pod: H / Math.max(1e-6, H + M),
    far: F / Math.max(1e-6, H + F),
    csi: H / Math.max(1e-6, H + M + F),
    ets: (H - hr) / Math.max(1e-6, H + M + F - hr),
  };
}

/** Brier score of probabilities p against binary outcomes o. */
export function brier(p: ArrayLike<number>, o: ArrayLike<number>) {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += (p[i] - o[i]) ** 2;
  return p.length ? s / p.length : 0;
}

/**
 * Honest verification: every 10 sim-min each method issues forecasts for 30/60/120/180 min.
 * When the valid time arrives they are scored against the observed field (8 km grid, >=35 dBZ event).
 * Scores are exponentially-weighted over recent verifications (half-life ~ 12 verifications),
 * so they drift with the weather like a real ops dashboard.
 */
export class Verifier {
  private pending: Pending[] = [];
  private acc = new Map<string, Acc>();
  private rel: { f: number; o: number; n: number }[] = Array.from({ length: 10 }, () => ({ f: 0, o: 0, n: 0 }));
  samples = 0;
  updatedAt = 0;
  constructor(
    public w: number,
    public h: number,
  ) {}

  issue(t: number, lead: number, method: Method, dbz: Float32Array, prob: Float32Array) {
    this.pending.push({ validAt: t + lead * 60000, lead, method, dbz, prob });
  }

  verifyDue(t: number, obs: Float32Array) {
    const due = this.pending.filter((p) => p.validAt <= t);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.validAt > t);
    for (const p of due) {
      const key = `${p.method}:${p.lead}`;
      let a = this.acc.get(key);
      if (!a) {
        a = { table: { hits: 0, misses: 0, falseAlarms: 0, correctNegatives: 0 }, brierSum: 0, brierN: 0, fssSum: 0, fssN: 0, n: 0 };
        this.acc.set(key, a);
      }
      const decay = 0.93;
      a.table.hits *= decay;
      a.table.misses *= decay;
      a.table.falseAlarms *= decay;
      a.table.correctNegatives *= decay;
      a.brierSum *= decay;
      a.brierN *= decay;
      a.fssSum *= decay;
      a.fssN *= decay;
      // neighbourhood contingency (8 km pixels)
      const W = this.w;
      const H = this.h;
      const fy = new Uint8Array(obs.length);
      const oy = new Uint8Array(obs.length);
      for (let k = 0; k < obs.length; k++) {
        oy[k] = obs[k] >= THR ? 1 : 0;
        fy[k] = p.method === 'vajra' ? (p.prob[k] >= (p.lead >= 120 ? 0.14 : 0.2) ? 1 : 0) : p.dbz[k] >= THR ? 1 : 0;
      }
      // spatial tolerance grows with lead time (8 km at 30 min, 16 km at 60 min, 32 km at 2-3 h), as in fuzzy verification
      const tol = p.lead <= 30 ? 1 : p.lead <= 60 ? 2 : 4;
      const near = (arr: Uint8Array, k: number) => {
        const x = k % W;
        const y = (k / W) | 0;
        for (let dy = -tol; dy <= tol; dy++)
          for (let dx = -tol; dx <= tol; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H && arr[yy * W + xx]) return true;
          }
        return false;
      };
      for (let k = 0; k < obs.length; k++) {
        const o = oy[k];
        const f = fy[k];
        if (f && near(oy, k)) a.table.hits++;
        else if (f) a.table.falseAlarms++;
        else if (o && !near(fy, k)) a.table.misses++;
        else if (!o) a.table.correctNegatives++;
        const pr = p.method === 'vajra' ? p.prob[k] : Math.min(1, Math.max(0, (p.dbz[k] - 25) / 20));
        // skip the vast clear-sky majority for Brier so it is not trivially ~0
        if (pr > 0.02 || o) {
          a.brierSum += (pr - o) ** 2;
          a.brierN++;
        }
        if (p.method === 'vajra' && p.lead === 60 && (pr > 0.02 || o)) {
          const b = Math.min(9, Math.floor(pr * 10));
          this.rel[b].f += pr;
          this.rel[b].o += o;
          this.rel[b].n++;
        }
      }
      const s = fss(p.dbz, obs, this.w, this.h, THR, 3);
      if (!Number.isNaN(s)) {
        a.fssSum += s;
        a.fssN++;
      }
      a.n++;
      this.samples++;
    }
    this.updatedAt = t;
    // keep reliability counts bounded
    for (const r of this.rel) {
      if (r.n > 20000) {
        r.f *= 0.5;
        r.o *= 0.5;
        r.n *= 0.5;
      }
    }
  }

  summary(): VerificationSummary {
    const scores: VerificationScore[] = [];
    for (const m of METHODS)
      for (const lead of LEADS) {
        const a = this.acc.get(`${m}:${lead}`);
        if (!a) continue;
        const cat = categorical(a.table);
        scores.push({
          method: m,
          leadMin: lead,
          n: a.n,
          ...cat,
          fss: a.fssN ? a.fssSum / a.fssN : 0,
          brier: a.brierN ? a.brierSum / a.brierN : 0,
          table: {
            hits: Math.round(a.table.hits),
            misses: Math.round(a.table.misses),
            falseAlarms: Math.round(a.table.falseAlarms),
            correctNegatives: Math.round(a.table.correctNegatives),
          },
        });
      }
    const reliability: ReliabilityBin[] = this.rel.map((r, i) => ({ forecast: r.n ? r.f / r.n : (i + 0.5) / 10, observed: r.n ? r.o / r.n : NaN, count: Math.round(r.n) }));
    return { scores, reliability, samples: this.samples, updatedAt: this.updatedAt };
  }

  pendingCount() {
    return this.pending.length;
  }
}
