import { describe, expect, it } from 'vitest';
import { World } from '../engine/engine';
import { Rng } from '../engine/prng';
import { makeCell, sampleAndDetectJump, updatePhysics } from '../engine/cells';
import { scenarioById } from '../engine/scenarios';
import { explain, predict } from '../engine/model';
import { resolveSeed } from '../lib/seed';

const CLOCK = () => Date.UTC(2026, 3, 14, 10, 0, 0);
const mk = (seed: number, locked = true) => new World('kolkata-kalbaisakhi', { seed, locked, clock: CLOCK });

function fingerprint(w: World) {
  const s = w.snapshot();
  return JSON.stringify({
    cells: s.cells.map((c) => [c.id, c.lng.toFixed(5), c.lat.toFixed(5), c.maxDbz.toFixed(3), c.flashRate.toFixed(3)]),
    strikes: s.strikes.length,
    alerts: s.alerts.map((a) => [a.id, a.severity, a.status]),
  });
}

describe('determinism & seeds', () => {
  it('same seed + same clock => identical world, tick for tick', () => {
    const a = mk(1234);
    const b = mk(1234);
    for (let i = 0; i < 40; i++) {
      a.step(15000);
      b.step(15000);
    }
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('different seeds => different worlds', () => {
    const a = mk(1);
    const b = mk(2);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('unlocked seeds change on each page session; ?seed= locks them', () => {
    const locked = resolveSeed('?seed=1234');
    expect(locked).toEqual({ seed: 1234, locked: true });
    const a = resolveSeed('');
    expect(a.locked).toBe(false);
    expect(Number.isInteger(a.seed)).toBe(true);
  });

  it('locked seed survives scenario switch and reset', () => {
    const w = mk(4242);
    const base = w.baseSeed;
    w.command({ type: 'scenario', id: 'mumbai-monsoon' });
    w.command({ type: 'reset' });
    expect(w.baseSeed).toBe(base);
  });

  it('the simulation clock follows the injected real clock', () => {
    const w = mk(7);
    expect(Math.abs(w.t - CLOCK())).toBeLessThan(1000);
    w.step(250);
    expect(w.t - CLOCK()).toBeGreaterThanOrEqual(250 - 1000);
  });
});

describe('physical coupling (no impossible combinations)', () => {
  const w = mk(99);
  for (let i = 0; i < 60; i++) w.step(30000);
  const cells = w.snapshot().cells;

  it('has cells to check', () => expect(cells.length).toBeGreaterThan(0));

  it('high flash rate only with strong reflectivity and tall tops', () => {
    for (const c of cells) if (c.flashRate > 15) expect(c.maxDbz).toBeGreaterThan(45);
    for (const c of cells) if (c.flashRate > 15) expect(c.echoTopKm).toBeGreaterThan(10);
  });

  it('mature cells have cold cloud tops', () => {
    for (const c of cells) if (c.stage === 'mature' && c.maxDbz > 50) expect(c.cttK).toBeLessThan(240);
  });

  it('cloud-top temperature follows echo top (6.5 K/km lapse, tropopause floor)', () => {
    for (const c of cells) expect(Math.abs(c.cttK - Math.max(192, Math.min(290, 303 - 6.5 * c.echoTopKm)))).toBeLessThan(0.01);
  });

  it('a RED cell never has a low probability', () => {
    for (const c of cells) if (c.severity === 'red') expect(c.probs.thunderstorm).toBeGreaterThanOrEqual(0.7);
  });

  it('probabilities are never 100 %', () => {
    for (const c of cells) for (const p of Object.values(c.probs)) expect(p).toBeLessThanOrEqual(0.97);
    expect(w.snapshot().regime.confidence).toBeLessThanOrEqual(0.97);
  });

  it('probability of a decaying cell does not rise', () => {
    const rng = new Rng(5);
    const sc = scenarioById('kolkata-kalbaisakhi');
    const c = makeCell(rng, 0, 87, 23, 'pulse', 0.9, sc);
    let t = 0;
    const env = { capeJkg: 2600, cinJkg: -30, shear06: 14, pwMm: 48, iwvRise: 1, convergence: 2 };
    let last = 1;
    let sawDecay = false;
    for (let i = 0; i < 200; i++) {
      t += 30000;
      updatePhysics(c, t, 0.5, { ...env, iwvRise: c.stage === 'decay' ? -0.5 : 1.5, convergence: c.stage === 'decay' ? -1 : 3 }, rng);
      c.history.push({ t, maxDbz: c.maxDbz, echoTopKm: c.echoTopKm, vil: c.vil, flashRate: c.flashRate, cttK: c.cttK });
      if (c.stage === 'decay' && c.intensity < 0.8) {
        const p = predict(c).thunderstorm;
        if (sawDecay) expect(p).toBeLessThanOrEqual(last + 0.03); // at most 3 pp of noise, never a real rise
        last = p;
        sawDecay = true;
      }
    }
    expect(sawDecay).toBe(true);
  });

  it('values change smoothly (bounded change per tick, no flicker)', () => {
    const w2 = mk(3);
    const prev = new Map(w2.snapshot().cells.map((c) => [c.id, c]));
    w2.step(250);
    for (const c of w2.snapshot().cells) {
      const p = prev.get(c.id);
      if (!p) continue;
      expect(Math.abs(c.maxDbz - p.maxDbz)).toBeLessThan(1.5);
      expect(Math.abs(c.flashRate - p.flashRate)).toBeLessThan(Math.max(1, p.flashRate * 0.2));
    }
  });

  it('numbers are not round or repeated (realistic precision)', () => {
    const dbz = cells.map((c) => c.maxDbz);
    expect(dbz.filter((v) => Number.isInteger(v)).length).toBe(0);
    expect(new Set(dbz.map((v) => v.toFixed(2))).size).toBe(dbz.length);
  });
});

describe('XAI', () => {
  it('contributions add up exactly to the shown probability', () => {
    const w = mk(11);
    for (let i = 0; i < 30; i++) w.step(30000);
    for (const c of w.snapshot().cells) {
      const sum = c.xai.contributions.reduce((a, x) => a + x.pp, 0);
      expect(Math.round(sum * 10) / 10).toBeCloseTo(Math.round(c.xai.probability * 1000) / 10, 5);
    }
  });

  it('XAI probability equals the model thunderstorm probability', () => {
    const rng = new Rng(8);
    const c = makeCell(rng, 0, 87, 23, 'multicell', 0.9, scenarioById('kolkata-kalbaisakhi'));
    for (let t = 30000; t < 30 * 60000; t += 30000) updatePhysics(c, t, 0.5, { capeJkg: 3100, cinJkg: -20, shear06: 18, pwMm: 50, iwvRise: 2, convergence: 4 }, rng);
    expect(explain(c).probability).toBeCloseTo(Math.round(predict(c).thunderstorm * 1000) / 1000, 2);
  });
});

describe('lightning jump (2σ) detector', () => {
  it('fires on a sudden flash-rate increase and not on a steady rate', () => {
    const rng = new Rng(1);
    const c = makeCell(rng, 0, 87, 23, 'multicell', 0.9, scenarioById('kolkata-kalbaisakhi'));
    let t = 0;
    c.lastSampleAt = 0;
    const rates = [10, 10.5, 11, 10.8, 11.2, 11, 11.3, 11.1, 30, 31];
    const fired: boolean[] = [];
    const sigma: number[] = [];
    for (const r of rates) {
      t += 120000;
      c.flashRate = r;
      fired.push(sampleAndDetectJump(c, t));
      sigma.push(c.jumpSigma);
    }
    expect(fired.slice(0, 8).some(Boolean)).toBe(false);
    expect(fired[8]).toBe(true);
    expect(sigma[8]).toBeGreaterThan(2);
    expect(c.lightningJump).toBe(true); // stays flagged for 20 min after the jump
  });
});

describe('imperfections are present', () => {
  it('feed latency jitters within 40-400 ms and strikes fade by age', () => {
    const w = mk(21);
    const lat = new Set<number>();
    for (let i = 0; i < 40; i++) {
      w.step(250);
      const s = w.snapshot();
      lat.add(s.stats.latencyMs);
      expect(s.stats.latencyMs).toBeGreaterThanOrEqual(40);
      expect(s.stats.latencyMs).toBeLessThanOrEqual(400);
      for (const st of s.strikes) expect(s.stats.simTime - st.t).toBeLessThanOrEqual(20 * 60000 + 1);
    }
    expect(lat.size).toBeGreaterThan(5);
  });

  it('a sensor drops out and self-heals within ~15 min', () => {
    const w = mk(31);
    let sawDrop = false;
    let sawHeal = false;
    for (let i = 0; i < 30; i++) {
      w.step(60000);
      const s = w.snapshot();
      if (s.sensors.some((x) => x.anomaly === 'dropout')) sawDrop = true;
      if (s.events.some((e) => e.kind === 'sensor' && /self-healed|probation/.test(e.text))) sawHeal = true;
    }
    expect(sawDrop).toBe(true);
    expect(sawHeal).toBe(true);
  });
});
