import type { EngineEvent } from '@vajra/contracts';
import { fmtIST } from '../../lib/format';

/** Swimlane per sensor for the last 60 min: fault detected (red) → recovering (cyan) → healed (green). */
export function AnomalyTimeline({ events, now }: { events: EngineEvent[]; now: number }) {
  const span = 60 * 60000;
  const rows = new Map<string, { t: number; kind: 'fault' | 'recovering' | 'healed' | 'injected'; text: string }[]>();
  for (const e of events) {
    if (e.kind !== 'sensor' && !(e.kind === 'director' && e.text.includes('fault'))) continue;
    if (now - e.t > span) continue;
    const name = e.kind === 'director' ? (e.text.match(/into (.+)$/)?.[1] ?? 'sensor') : e.text.split(':')[0];
    const kind = e.kind === 'director' ? 'injected' : e.text.includes('auto-excluded') ? 'fault' : e.text.includes('probation') ? 'recovering' : 'healed';
    rows.set(name, [...(rows.get(name) ?? []), { t: e.t, kind, text: e.text }]);
  }
  const color = { fault: '#ef4444', recovering: '#22d3ee', healed: '#22c55e', injected: '#a78bfa' } as const;
  if (!rows.size)
    return (
      <div className="text-xs text-slate-400">
        No sensor anomalies in the last 60 min. A scheduled dropout arrives about every 10 min; or inject one from Director Mode (Shift+D).
      </div>
    );
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between pl-[150px] font-mono text-[10px] text-slate-500">
        <span>{fmtIST(now - span)}</span>
        <span>{fmtIST(now - span / 2)}</span>
        <span>now</span>
      </div>
      {[...rows.entries()].slice(0, 8).map(([name, evs]) => (
        <div key={name} className="flex items-center gap-2">
          <div className="w-[142px] truncate text-[12px] text-slate-300" title={name}>
            {name}
          </div>
          <div className="relative h-4 flex-1 rounded bg-white/[0.04]">
            {evs.map((e, i) => (
              <span
                key={i}
                title={`${fmtIST(e.t, true)} — ${e.text}`}
                className="absolute top-0.5 h-3 w-1.5 rounded-sm"
                style={{ left: `${((e.t - (now - span)) / span) * 100}%`, background: color[e.kind] }}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-3 pl-[150px] text-[10px] text-slate-400">
        {Object.entries(color).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: c }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
