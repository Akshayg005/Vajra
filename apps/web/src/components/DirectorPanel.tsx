import { AnimatePresence, motion } from 'framer-motion';
import { Bug, Clapperboard, Crosshair, Lock, RotateCcw, Unlock, X, Zap } from 'lucide-react';
import { useState } from 'react';
import type { AnomalyType, StormType } from '@vajra/contracts';
import { useStore } from '../store';
import { SCENARIOS } from '../engine/scenarios';

/** Hidden presenter panel (Shift+D). Lets the presenter fire a severe event on cue. */
export function DirectorPanel() {
  const open = useStore((s) => s.directorOpen);
  const setOpen = useStore((s) => s.setDirector);
  const snap = useStore((s) => s.snap);
  const send = useStore((s) => s.send);
  const setPickMode = useStore((s) => s.setPickMode);
  const spawnType = useStore((s) => s.spawnType);
  const setSpawnType = useStore((s) => s.setSpawnType);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const selected = useStore((s) => s.selectedCellId);
  const [seed, setSeed] = useState<string>('');
  const [lock, setLock] = useState(false);
  const [anomaly, setAnomaly] = useState<AnomalyType>('dropout');
  const dwr = snap?.sensors.filter((s) => s.kind === 'dwr') ?? [];
  const [sensorId, setSensorId] = useState<string>('');
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 380, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 380, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="fixed bottom-4 right-4 top-16 z-40 w-[340px] overflow-y-auto rounded-2xl border border-plasma/40 bg-ink-900/95 p-4 shadow-violet backdrop-blur scroll-thin"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-plasma-soft">
              <Clapperboard className="h-4 w-4" />
              <span className="text-sm font-bold uppercase tracking-[0.2em]">Director Mode</span>
            </div>
            <button className="btn h-7 w-7 p-0" onClick={() => setOpen(false)} aria-label="Close Director Mode">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <Section title="Scenario">
            <div className="grid grid-cols-1 gap-1">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void send({ type: 'scenario', id: s.id })}
                  className={`rounded-md border px-2 py-1.5 text-left text-xs ${snap?.scenario.id === s.id ? 'border-plasma/60 bg-plasma/15 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Spawn a storm where you click">
            <div className="mb-2 grid grid-cols-4 gap-1">
              {(['pulse', 'multicell', 'squall', 'supercell'] as StormType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setSpawnType(t)}
                  className={`rounded-md border px-1 py-1 text-[11px] capitalize ${spawnType === t ? 'border-volt/60 bg-volt/15 text-white' : 'border-white/10 text-slate-400'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button className="btn btn-primary w-full" onClick={() => setPickMode('spawn')}>
              <Crosshair className="h-4 w-4" /> Click map to spawn {spawnType}
            </button>
          </Section>
          <Section title="Force a lightning jump">
            <button className="btn w-full border-volt/40 text-volt" onClick={() => void send({ type: 'jump', cellId: selected ?? undefined })}>
              <Zap className="h-4 w-4" /> Pulse {selected ? `cell ${selected}` : 'strongest cell'}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">Adds an updraft pulse. The 2σ detector should fire in ~4–8 sim-min.</p>
          </Section>
          <Section title="Speed">
            <div className="grid grid-cols-4 gap-1">
              {[1, 5, 20, 60].map((v) => (
                <button
                  key={v}
                  onClick={() => setSpeed(v)}
                  className={`rounded-md border px-1 py-1 font-mono text-xs ${speed === v ? 'border-volt/60 bg-volt/15 text-white' : 'border-white/10 text-slate-400'}`}
                >
                  {v}×
                </button>
              ))}
            </div>
          </Section>
          <Section title="Seed">
            <div className="flex gap-1">
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
                placeholder={String(useStore.getState().seed)}
                className="w-full rounded-md border border-white/10 bg-ink-800 px-2 py-1 font-mono text-xs outline-none focus:border-volt/60"
              />
              <button className="btn px-2" title={lock ? 'Seed locked' : 'Seed unlocked'} onClick={() => setLock(!lock)}>
                {lock ? <Lock className="h-3.5 w-3.5 text-volt" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
              <button className="btn px-2" onClick={() => void send({ type: 'seed', value: Number(seed || useStore.getState().seed || 1), lock })}>
                Apply
              </button>
            </div>
            <button className="btn mt-2 w-full" onClick={() => void send({ type: 'reset' })}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset scenario
            </button>
          </Section>
          <Section title="Trigger a sensor failure">
            <select value={sensorId} onChange={(e) => setSensorId(e.target.value)} className="mb-1 w-full rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-xs">
              <option value="">Nearest DWR to scenario</option>
              {dwr.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {snap?.sensors
                .filter((s) => s.kind !== 'dwr')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <div className="mb-2 grid grid-cols-4 gap-1">
              {(['spike', 'frozen', 'drift', 'dropout'] as AnomalyType[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAnomaly(a)}
                  className={`rounded-md border px-1 py-1 text-[11px] ${anomaly === a ? 'border-sev-orange/60 bg-sev-orange/15 text-white' : 'border-white/10 text-slate-400'}`}
                >
                  {a}
                </button>
              ))}
            </div>
            <button className="btn w-full border-sev-orange/40 text-sev-orange" onClick={() => void send({ type: 'sensorFail', sensorId: sensorId || undefined, anomaly })}>
              Inject {anomaly}
            </button>
          </Section>
          <Section title="Resilience drill">
            <button className="btn w-full border-sev-red/40 text-sev-red" onClick={() => useStore.getState().adapter?.crash()}>
              <Bug className="h-4 w-4" /> Crash the engine worker
            </button>
            <p className="mt-1 text-[11px] text-slate-500">The app restarts the worker with the same seed within a second and shows an “auto-restarted” chip.</p>
          </Section>
          <div className="mt-2 font-mono text-[10px] text-slate-500">
            base seed {useStore.getState().seed} · scenario seed {snap?.stats.seed} · tick {snap?.stats.tick} · {snap?.stats.tickMs.toFixed(1)} ms/tick · Shift+D to hide
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="panel-title mb-2">{title}</div>
      {children}
    </div>
  );
}
