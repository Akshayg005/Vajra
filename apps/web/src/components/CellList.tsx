import { Zap } from 'lucide-react';
import { useStore } from '../store';
import { SEV_RANK, STAGE_LABEL, compass } from '../lib/format';
import { SeverityBadge } from './SeverityBadge';
import { Sparkline } from './Sparkline';
import { flyToCell } from './MapView';

export function CellList() {
  const cells = useStore((s) => s.snap?.cells ?? []);
  const select = useStore((s) => s.select);
  const sorted = [...cells]
    .filter((c) => c.maxDbz > 30)
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.maxDbz - a.maxDbz)
    .slice(0, 12);
  return (
    <div className="panel pointer-events-auto flex max-h-full w-[400px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 p-3">
        <span className="panel-title whitespace-nowrap">Tracked storm cells</span>
        <span className="text-[11px] text-slate-500">select for inspector</span>
      </div>
      <div className="scroll-thin overflow-y-auto">
        {sorted.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              select(c.id);
              flyToCell(c);
            }}
            className="grid w-full grid-cols-[46px_1fr_78px_70px] items-center gap-2 border-b border-white/[0.04] px-3 py-2 text-left hover:bg-white/5"
          >
            <span className="font-mono text-sm font-bold text-white">{c.id}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <SeverityBadge severity={c.severity} compact />
                {c.lightningJump && <Zap className="h-3.5 w-3.5 text-volt" />}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-400">
                {STAGE_LABEL[c.stage]} · {compass(c.headingDeg)} {Math.round(c.speedKmh)} km/h
              </div>
            </div>
            <div className="text-right font-mono text-[12px] tnum text-slate-200">
              {Math.round(c.maxDbz)} dBZ
              <div className="text-[11px] text-volt">{c.flashRate.toFixed(1)} fl/m</div>
            </div>
            <Sparkline values={c.history.map((h) => h.flashRate).slice(-25)} width={70} height={26} />
          </button>
        ))}
        {!sorted.length && <div className="p-4 text-sm text-slate-500">No significant echoes. Storms will initiate as the afternoon heats up.</div>}
      </div>
    </div>
  );
}
