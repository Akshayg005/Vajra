import type { XaiExplanation } from '@vajra/contracts';
import { Brain } from 'lucide-react';

/** Waterfall of additive contributions that sum exactly to the displayed probability. */
export function XaiPanel({ xai }: { xai: XaiExplanation }) {
  const items = xai.contributions;
  const total = items.reduce((a, c) => a + c.pp, 0);
  const maxAbs = Math.max(...items.map((c) => Math.abs(c.pp)), 1);
  let run = 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="panel-title flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-plasma" /> Why? (explainable AI)
        </span>
        <span className="font-mono text-xs text-slate-400">Σ = <span className="text-white">{total.toFixed(1)}%</span></span>
      </div>
      <div className="space-y-1">
        {items.map((c) => {
          const start = run;
          run += c.pp;
          const left = Math.min(start, run);
          const w = Math.abs(c.pp);
          return (
            <div key={c.feature} className="grid grid-cols-[112px_1fr_46px] items-center gap-2 text-[11px]">
              <span className="truncate text-slate-300" title={`${c.label}: ${c.value.toFixed(1)} ${c.unit}`}>
                {c.label}
              </span>
              <div className="relative h-3 rounded-sm bg-white/[0.04]">
                <div
                  className={`absolute top-0 h-3 rounded-sm ${c.feature === 'bias' ? 'bg-slate-500/70' : c.pp >= 0 ? 'bg-gradient-to-r from-plasma to-volt' : 'bg-sev-orange/80'}`}
                  style={{ left: `${(left / Math.max(100, maxAbs)) * 100}%`, width: `${Math.max(0.6, (w / Math.max(100, maxAbs)) * 100)}%`, transition: 'all 400ms ease-out' }}
                />
              </div>
              <span className={`text-right font-mono tnum ${c.pp >= 0 ? 'text-slate-100' : 'text-sev-orange'}`}>
                {c.pp >= 0 ? '+' : ''}
                {c.pp.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 rounded-md border border-plasma/20 bg-plasma/[0.06] p-2 text-[12px] leading-snug text-slate-200">{xai.reason}</p>
    </div>
  );
}
