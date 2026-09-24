import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe('"looks hardcoded" guards', () => {
  const all = files(SRC);

  it('no Math.random anywhere (randomness only from the seeded PRNG)', () => {
    for (const f of all) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random\s*\(/);
  });

  it('noise and PRNG are only used inside src/engine', () => {
    for (const f of all.filter((x) => !x.includes('/engine/'))) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/from 'simplex-noise'/);
      expect(s, f).not.toMatch(/new Rng\(/);
    }
  });

  it('the engine never reads the wall clock directly (clock is injected)', () => {
    for (const f of all.filter((x) => x.includes('/engine/') && !x.endsWith('worker.ts'))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Date\.now\(\)/);
  });

  it('no "coming soon", lorem ipsum or TODO placeholders', () => {
    for (const f of all) expect(readFileSync(f, 'utf8'), f).not.toMatch(/coming soon|lorem ipsum|TODO|FIXME/i);
  });

  it('no explicit any', () => {
    for (const f of all) expect(readFileSync(f, 'utf8'), f).not.toMatch(/:\s*any\b|as any\b|<any>/);
  });

  it('no API keys or secrets in the web bundle sources', () => {
    for (const f of all) expect(readFileSync(f, 'utf8'), f).not.toMatch(/sk-ant-|ANTHROPIC_API_KEY|api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]/i);
  });
});
