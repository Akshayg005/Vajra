import { useMemo } from 'react';
import { Bell, GitMerge, VolumeX } from 'lucide-react';
import type { Alert } from '@vajra/contracts';
import { SeverityBadge } from '../SeverityBadge';
import { AnimatedNumber } from '../AnimatedNumber';
import { SEV_RANK, isLive } from '../../selectors';
import { ago, useSimNow } from '../../lib/useNow';

export type AlertFilter = 'live' | 'draft' | 'all';

export function AlertList({ alerts, selectedId, onSelect, filter, setFilter }: { alerts: Alert[]; selectedId: string | undefined; onSelect: (id: string) => void; filter: AlertFilter; setFilter: (f: AlertFilter) => void }) {
  const now = useSimNow();
  const list = useMemo(
    () =>
      [...alerts]
        .filter((a) => (filter === 'live' ? isLive(a) : filter === 'draft' ? a.status === 'draft' : true))
        .sort((a, b) => Number(!isLive(a)) - Number(!isLive(b)) || SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.updatedAt - a.updatedAt),
    [alerts, filter],
  );
  const suppressed = alerts.filter((x) => x.status === 'suppressed').length + alerts.reduce((s, x) => s + (x.status === 'suppressed' ? 0 : x.suppressed), 0);
  const merged = alerts.filter((x) => x.status === 'merged').length + alerts.reduce((s, x) => s + x.mergedFrom.length, 0);
  const falseAlarms = alerts.filter((x) => x.falseAlarm).length;
  return (
    <div className="panel flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/5 p-3">
        <span className="panel-title">Warnings</span>
        <div className="flex gap-1" role="tablist">
          {(['live', 'draft', 'all'] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`rounded-md px-2 py-0.5 text-xs ${filter === f ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/5'}`}>
              {f === 'live' ? 'Live' : f === 'draft' ? `Drafts (${alerts.filter((a) => a.status === 'draft').length})` : 'All (log)'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-b border-white/5 p-3 text-center" title="Alert-fatigue guard: overlapping warnings are merged and repeats are suppressed instead of re-sent">
        <Mini label="Repeats suppressed" value={suppressed} Icon={VolumeX} />
        <Mini label="Merged overlaps" value={merged} Icon={GitMerge} />
        <Mini label="Verified false alarms" value={falseAlarms} Icon={Bell} />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {list.map((x) => (
          <button key={x.id} onClick={() => onSelect(x.id)} className={`w-full border-b border-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/5 ${selectedId === x.id ? 'bg-white/[0.06]' : ''} ${!isLive(x) ? 'opacity-55' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <SeverityBadge severity={x.severity} />
                {x.status === 'draft' && <span className="rounded border border-plasma/50 px-1 text-[10px] font-bold uppercase text-plasma-soft">draft</span>}
                {x.status === 'suppressed' && <span className="rounded border border-slate-500/50 px-1 text-[10px] font-bold uppercase text-slate-400">suppressed</span>}
                {x.status === 'merged' && <span className="rounded border border-slate-500/50 px-1 text-[10px] font-bold uppercase text-slate-400">merged → {x.mergedInto}</span>}
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                {x.id} · {ago(x.updatedAt, now)}
              </span>
            </div>
            <div className="mt-1 text-[13px] font-medium text-slate-100">{x.headline}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
              <span>
                {x.district}, {x.state}
              </span>
              <span className="font-mono tnum">P {(x.probability * 100).toFixed(1)}%</span>
              {x.etaMin > 0 && <span className="font-mono tnum">ETA {x.etaMin} min</span>}
              {x.falseAlarm && <span className="text-sev-orange">false alarm</span>}
              {x.suppressed > 0 && x.status !== 'suppressed' && <span className="text-slate-500">+{x.suppressed} merged/suppressed</span>}
            </div>
          </button>
        ))}
        {!list.length && <div className="p-6 text-sm text-slate-500">No warnings in this view. The fatigue guard keeps this list short.</div>}
      </div>
    </div>
  );
}

function Mini({ label, value, Icon }: { label: string; value: number; Icon: typeof Bell }) {
  return (
    <div>
      <Icon className="mx-auto h-4 w-4 text-slate-500" />
      <AnimatedNumber value={value} className="font-mono text-lg font-semibold text-white" />
      <div className="text-[10px] leading-tight text-slate-400">{label}</div>
    </div>
  );
}
