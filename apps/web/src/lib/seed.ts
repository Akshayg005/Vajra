/**
 * Seed policy.
 *  - default: hash(today's date + this page session) -> every reload looks fresh
 *  - ?seed=1234 -> locked seed for rehearsals (identical storms and alerts every run)
 * performance.timeOrigin is unique per page load, so no randomness API is needed outside the engine.
 */
export function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function resolveSeed(search: string = location.search): { seed: number; locked: boolean } {
  const q = new URLSearchParams(search).get('seed');
  if (q && /^\d{1,10}$/.test(q)) return { seed: Number(q) >>> 0, locked: true };
  const today = new Date().toISOString().slice(0, 10);
  const session = typeof performance !== 'undefined' ? String(performance.timeOrigin) : '0';
  return { seed: fnv1a(`${today}|${session}`), locked: false };
}
