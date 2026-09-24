import { describe, expect, it } from 'vitest';
import type { MultiTaskProbs } from '@vajra/contracts';
import { brier, categorical } from '../engine/verification';
import { fss } from '../engine/fields';
import { AlertManager, capXml, severityOf } from '../engine/alerts';
import { makeCell, updatePhysics } from '../engine/cells';
import { Rng } from '../engine/prng';
import { scenarioById } from '../engine/scenarios';
import { World } from '../engine/engine';
import { DICTS, en } from '../i18n';
import { alertsCsv } from '../lib/exports';

describe('verification maths on known inputs', () => {
  it('POD, FAR, CSI, ETS', () => {
    const s = categorical({ hits: 50, misses: 20, falseAlarms: 30, correctNegatives: 900 });
    expect(s.pod).toBeCloseTo(50 / 70, 6);
    expect(s.far).toBeCloseTo(30 / 80, 6);
    expect(s.csi).toBeCloseTo(50 / 100, 6);
    const hr = (70 * 80) / 1000;
    expect(s.ets).toBeCloseTo((50 - hr) / (100 - hr), 6);
  });

  it('perfect and useless forecasts', () => {
    expect(categorical({ hits: 10, misses: 0, falseAlarms: 0, correctNegatives: 90 }).csi).toBe(1);
    expect(categorical({ hits: 0, misses: 10, falseAlarms: 10, correctNegatives: 80 }).csi).toBe(0);
  });

  it('Brier score', () => {
    expect(brier([1, 0, 0.5], [1, 0, 1])).toBeCloseTo(0.25 / 3, 6);
    expect(brier([0.2, 0.8], [0, 1])).toBeCloseTo(0.04, 6);
  });

  it('FSS: identical fields = 1, displaced field < 1 but improves with neighbourhood', () => {
    const w = 20;
    const h = 20;
    const a = new Float32Array(w * h);
    const b = new Float32Array(w * h);
    for (let y = 8; y < 12; y++)
      for (let x = 5; x < 9; x++) {
        a[y * w + x] = 50;
        b[y * w + x + 3] = 50;
      }
    expect(fss(a, a, w, h, 35, 1)).toBeCloseTo(1, 6);
    const small = fss(a, b, w, h, 35, 0);
    const big = fss(a, b, w, h, 35, 4);
    expect(small).toBeLessThan(1);
    expect(big).toBeGreaterThan(small);
  });

  it('skill falls with lead time and stays realistic (never near-perfect)', () => {
    const w = new World('kolkata-kalbaisakhi', { seed: 777, locked: true, clock: () => Date.UTC(2026, 3, 14, 10, 0, 0) });
    for (let i = 0; i < 200; i++) w.step(60000);
    const v = w.verifier.summary();
    const csi = (lead: number) => v.scores.find((s) => s.method === 'vajra' && s.leadMin === lead)!.csi;
    expect(csi(30)).toBeGreaterThan(csi(60));
    expect(csi(60)).toBeGreaterThan(csi(180));
    for (const s of v.scores) expect(s.csi).toBeLessThan(0.85);
    // VAJRA beats persistence at 60 min
    const pers = v.scores.find((s) => s.method === 'persistence' && s.leadMin === 60)!.csi;
    expect(csi(60)).toBeGreaterThan(pers);
  });
});

describe('alert thresholds and fatigue guard', () => {
  const probs = (p: number): MultiTaskProbs => ({ thunderstorm: p, lightning: p, hail: 0.1, gust50: 0.2, heavyRain: 0.3 });
  const rng = new Rng(3);
  const sc = scenarioById('kolkata-kalbaisakhi');

  it('IMD colour follows probability and intensity', () => {
    const c = makeCell(rng, 0, 88, 23, 'multicell', 1, sc);
    c.maxDbz = 38;
    expect(severityOf(probs(0.3), c)).toBe('green');
    c.maxDbz = 44;
    expect(severityOf(probs(0.5), c)).toBe('yellow');
    c.maxDbz = 50;
    expect(severityOf(probs(0.6), c)).toBe('orange');
    c.maxDbz = 58;
    c.flashRate = 30;
    expect(severityOf(probs(0.8), c)).toBe('red');
    expect(severityOf(probs(0.4), c)).not.toBe('red');
  });

  it('RED auto-issues, lower severities start as drafts; overlapping storms merge', () => {
    const m = new AlertManager();
    const a = makeCell(rng, 0, 88.3, 22.6, 'supercell', 1, sc, false, 1);
    for (let t = 30000; t < 25 * 60000; t += 30000) updatePhysics(a, t, 0.5, { capeJkg: 3500, cinJkg: -10, shear06: 22, pwMm: 50, iwvRise: 3, convergence: 6 }, rng);
    a.flashRate = 35;
    a.maxDbz = 60;
    const b = makeCell(rng, 0, 88.32, 22.61, 'pulse', 1, sc, false, 2);
    b.maxDbz = 50;
    const events: string[] = [];
    m.step([a], new Map([[a.id, probs(0.85)]]), sc, 25 * 60000, 1, rng, (text) => events.push(text));
    expect(m.alerts[0].status).toBe('active');
    expect(m.alerts[0].severity).toBe('red');
    m.step(
      [a, b],
      new Map([
        [a.id, probs(0.85)],
        [b.id, probs(0.6)],
      ]),
      sc,
      26 * 60000,
      1,
      rng,
      (text) => events.push(text),
    );
    expect(m.alerts.length).toBe(1);
    expect(m.alerts[0].mergedFrom).toContain(b.id);
  });

  it('forecaster actions: issue, suppress, merge, edit polygon', () => {
    const w = new World('kolkata-kalbaisakhi', { seed: 55, locked: true, clock: () => Date.UTC(2026, 3, 14, 10, 0, 0) });
    for (let i = 0; i < 40 && w.alerts.alerts.filter((a) => a.status !== 'expired').length < 2; i++) w.step(60000);
    const live = w.alerts.alerts.filter((a) => a.status !== 'expired' && a.status !== 'merged');
    expect(live.length).toBeGreaterThanOrEqual(2);
    const [x, y] = live;
    w.command({ type: 'alertSuppress', id: x.id });
    expect(w.alerts.alerts.find((a) => a.id === x.id)!.status).toBe('suppressed');
    w.command({ type: 'alertIssue', id: x.id });
    expect(w.alerts.alerts.find((a) => a.id === x.id)!.issuedBy).toBe('forecaster');
    const before = w.alerts.alerts.find((a) => a.id === y.id)!.impact.population;
    const poly = y.polygon.map(([lng, lat]) => [lng + (lng - y.polygon[0][0]) * 0.5, lat] as [number, number]);
    w.command({ type: 'alertPolygon', id: y.id, polygon: poly });
    const after = w.alerts.alerts.find((a) => a.id === y.id)!;
    expect(after.edited).toBe(true);
    expect(after.impact.population).not.toBe(before);
    w.command({ type: 'alertMerge', id: x.id, into: y.id });
    expect(w.alerts.alerts.find((a) => a.id === x.id)!.status).toBe('merged');
  });

  it('bulletins vary in wording but keep the same numbers', () => {
    const w = new World('bihar-jharkhand-outbreak', { seed: 9, locked: true, clock: () => Date.UTC(2026, 3, 14, 10, 0, 0) });
    for (let i = 0; i < 40; i++) w.step(60000);
    const texts = new Set(
      w.alerts.alerts.map((a) =>
        a.bulletin
          .split('\n')
          .slice(2)
          .join('\n')
          .replace(/[\d.]+/g, '#')
          .replace(/VJ-\S+|Storm \S+/g, ''),
      ),
    );
    expect(texts.size).toBeGreaterThan(1);
  });
});

describe('CAP 1.2 builder and CSV export', () => {
  const w = new World('kolkata-kalbaisakhi', { seed: 5, locked: true, clock: () => Date.UTC(2026, 3, 14, 10, 0, 0) });
  for (let i = 0; i < 30; i++) w.step(60000);
  const a = w.alerts.alerts[0];

  it('produces well-formed CAP with the mandatory elements', () => {
    const xml = capXml(a);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="urn:oasis:names:tc:emergency:cap:1.2"');
    for (const tag of [
      'identifier',
      'sender',
      'sent',
      'status',
      'msgType',
      'scope',
      'info',
      'category',
      'event',
      'urgency',
      'severity',
      'certainty',
      'area',
      'areaDesc',
      'polygon',
    ])
      expect(xml).toContain(`<${tag}>`);
    // every opened element is closed
    const open = (xml.match(/<([a-zA-Z]+)[ >]/g) ?? []).map((t) => t.slice(1, -1).trim());
    for (const t of open) if (t !== 'alert') expect(xml).toContain(`</${t}>`);
    // sent uses +05:30 and polygon is closed "lat,lon" pairs
    expect(xml).toMatch(/<sent>\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+05:30<\/sent>/);
    const poly = xml.match(/<polygon>([^<]+)<\/polygon>/)![1].split(' ');
    expect(poly[0]).toBe(poly[poly.length - 1]);
    expect(poly.length).toBeGreaterThanOrEqual(4);
  });

  it('CSV is Excel-safe (BOM, quoted, formula-injection guarded)', () => {
    const csv = alertsCsv([{ ...a, headline: '=cmd()', district: 'Test, "quoted"' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Test, ""quoted"""');
    expect(csv.split('\r\n').length).toBe(2);
  });
});

describe('i18n', () => {
  it('every language has every key, with no empty strings', () => {
    const keys = Object.keys(en);
    for (const [code, dict] of Object.entries(DICTS)) {
      expect(Object.keys(dict).sort(), code).toEqual([...keys].sort());
      for (const k of keys) expect((dict as Record<string, string>)[k].trim().length, `${code}.${k}`).toBeGreaterThan(0);
    }
  });
  it('interpolation slots are kept in every language', () => {
    for (const dict of Object.values(DICTS)) {
      expect(dict.waitMin).toContain('{{n}}');
      expect(dict.stayInside).toContain('{{n}}');
    }
  });
});
