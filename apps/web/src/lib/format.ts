import type { Severity } from '@vajra/contracts';
export { fmtIST, distanceKm, bearingDeg } from '../engine/geo';
export { compass, fmtN } from '../engine/alerts';

export const SEV_HEX: Record<Severity, string> = { green: '#22c55e', yellow: '#facc15', orange: '#fb923c', red: '#ef4444' };
export const SEV_RGB: Record<Severity, [number, number, number]> = { green: [34, 197, 94], yellow: [250, 204, 21], orange: [251, 146, 60], red: [239, 68, 68] };
export const SEV_RANK: Record<Severity, number> = { green: 0, yellow: 1, orange: 2, red: 3 };

export const pct = (p: number, d = 0) => `${(p * 100).toFixed(d)}%`;
export const fx = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export const STAGE_LABEL = { initiation: 'Initiation', growth: 'Growth', mature: 'Mature', decay: 'Decay' } as const;
export const TYPE_LABEL = { pulse: 'Isolated pulse', multicell: 'Multicell', squall: "Squall line / Nor'wester", supercell: 'Supercell' } as const;

export function relMin(t: number, now: number) {
  const m = Math.round((now - t) / 60000);
  return m <= 0 ? 'now' : `${m} min ago`;
}

export function download(name: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
