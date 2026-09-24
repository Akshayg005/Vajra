import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CloudLightning, Cpu, GitMerge, Sparkles, Users, Zap } from 'lucide-react';
import type { EngineEvent } from '@vajra/contracts';
import { useStore } from '../store';
import { SEV_HEX } from '../lib/format';
import { ago, useSimNow } from '../lib/useNow';

const ICON: Record<EngineEvent['kind'], typeof Bell> = {
  jump: Zap,
  alert: Bell,
  alert_update: Bell,
  sensor: Cpu,
  cell_new: Sparkles,
  cell_split: GitMerge,
  cell_merge: GitMerge,
  cell_dead: CloudLightning,
  report: Users,
  director: Sparkles,
};

export function EventFeed({ limit = 9 }: { limit?: number }) {
  const events = useStore((s) => s.snap?.events);
  const select = useStore((s) => s.select);
  const now = useSimNow();
  const list = [...(events ?? [])]
    .filter((e) => e.kind !== 'cell_dead')
    .reverse()
    .slice(0, limit);
  return (
    <div className="panel pointer-events-auto w-[260px] p-3">
      <div className="panel-title mb-2">Live event log</div>
      <div className="space-y-1.5" aria-live="polite">
        <AnimatePresence initial={false}>
          {list.map((e) => {
            const I = ICON[e.kind];
            return (
              <motion.button
                layout
                key={e.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => e.cellId && select(e.cellId)}
                className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left hover:bg-white/5"
              >
                <I className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: e.severity ? SEV_HEX[e.severity] : e.kind === 'jump' ? '#22d3ee' : '#94a3b8' }} />
                <span className="flex-1 text-[11.5px] leading-snug text-slate-300">{e.text}</span>
                <span className="whitespace-nowrap font-mono text-[10px] text-slate-500">{ago(e.t, now)}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
