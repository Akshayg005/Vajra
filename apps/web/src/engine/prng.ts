import { createNoise2D, createNoise3D } from 'simplex-noise';

/** mulberry32: tiny, fast, deterministic 32-bit PRNG. The ONLY randomness source in VAJRA. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  readonly seed: number;
  constructor(seed: number) {
    this.seed = seed;
    this.next = mulberry32(seed);
  }
  f(): number {
    return this.next();
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** standard normal via Box-Muller */
  normal(mu = 0, sigma = 1): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Poisson sample (Knuth for small lambda, normal approx above 30) */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }
  /** log-normal, used for peak current kA */
  logNormal(median: number, sigmaLog: number): number {
    return median * Math.exp(this.normal(0, sigmaLog));
  }
  fork(salt: number): Rng {
    return new Rng((this.seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)) >>> 0);
  }
}

export function makeNoise(seed: number) {
  const r = mulberry32(seed ^ 0xa5a5a5a5);
  return { n2: createNoise2D(r), n3: createNoise3D(r) };
}
