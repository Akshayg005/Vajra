import { Activity, CloudLightning, Cloud, CloudOff, Lock, Monitor, Pause, Play, Radio, RefreshCw, Zap } from 'lucide-react';
import { useStore } from '../store';
import { fmtIST } from '../lib/format';
import { SCENARIOS } from '../engine/scenarios';
import { AnimatedNumber } from './AnimatedNumber';
import { SeverityBadge } from './SeverityBadge';
import { useLiveAlerts, worstSeverity, isIssued } from '../selectors';
import { HELP } from '../lib/help';

export function TopBar() {
  const snap = useStore((s) => s.snap);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const setPlaying = useStore((s) => s.setPlaying);
  const setSpeed = useStore((s) => s.setSpeed);
  const send = useStore((s) => s.send);
  const projector = useStore((s) => s.projector);
  const setProjector = useStore((s) => s.setProjector);
  const live = useLiveAlerts();
  const issued = live.filter(isIssued);
  const drafts = live.length - issued.length;
  const worst = worstSeverity(live);
  const degraded = snap?.sensors.filter((s) => s.state !== 'ok').length ?? 0;

  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-ink-900/90 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-volt/25 to-plasma/25 shadow-glow">
          <Zap className="h-5 w-5 text-volt" strokeWidth={2.5} />
        </div>
        <div className="hidden leading-tight lg:block">
          <div className="text-[15px] font-bold tracking-[0.2em] text-white">VAJRA</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Thunderstorm & Lightning Nowcast</div>
        </div>
      </div>

      <select
        className="ml-1 max-w-[260px] rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:border-volt/60"
        value={snap?.scenario.id ?? ''}
        onChange={(e) => void send({ type: 'scenario', id: e.target.value })}
        aria-label="Scenario"
      >
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {snap && (
        <span className="chip hidden 2xl:inline-flex" title={HELP.regime}>
          <CloudLightning className="h-3.5 w-3.5 text-plasma" />
          {snap.regime.label} · <span className="tnum">{(snap.regime.confidence * 100).toFixed(1)}%</span>
        </span>
      )}
      <StatusChip />

      <div className="ml-auto flex items-center gap-4">
        {snap && (
          <>
            <Stat label="Cells" value={snap.stats.cells} />
            <Stat label="Strikes/min" value={snap.stats.strikesLastMin} accent="text-volt" />
            <div className="flex flex-col items-end" title="Live warnings (issued + drafts awaiting a forecaster)">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Warnings</span>
              <span className="font-mono text-lg font-semibold leading-none text-white tnum">
                <AnimatedNumber value={issued.length} />
                {drafts > 0 && <span className="ml-1 text-xs text-slate-400">+{drafts} draft</span>}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Highest</span>
              <SeverityBadge severity={worst} compact />
            </div>
            <div className="hidden flex-col items-end xl:flex">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Sensors</span>
              <span className={`flex items-center gap-1 text-sm font-medium ${degraded ? 'text-sev-orange' : 'text-sev-green'}`}>
                <Activity className="h-3.5 w-3.5" />
                {degraded ? `${degraded} degraded` : 'All OK'}
              </span>
            </div>
          </>
        )}
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-ink-800 p-1">
          <button className="rounded-md p-1.5 hover:bg-white/10" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          {[1, 5, 20].map((v) => (
            <button key={v} onClick={() => setSpeed(v)} aria-pressed={speed === v} className={`rounded-md px-2 py-1 font-mono text-xs ${speed === v ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/10'}`}>
              {v}×
            </button>
          ))}
        </div>
        <button className={`rounded-md p-1.5 ${projector ? 'bg-plasma/20 text-plasma-soft' : 'text-slate-400 hover:bg-white/10'}`} onClick={() => setProjector(!projector)} title="Projector mode (P): larger text" aria-pressed={projector} aria-label="Projector mode">
          <Monitor className="h-4 w-4" />
        </button>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold tnum text-white">{snap ? fmtIST(snap.stats.simTime, true) : '--:--:--'}</div>
          <div className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider text-slate-400">
            <Radio className={`h-3 w-3 ${playing ? 'animate-pulse text-sev-red' : ''}`} /> IST {speed === 1 ? 'live' : `${speed}× replay`}
          </div>
        </div>
      </div>
    </header>
  );
}

function StatusChip() {
  const source = useStore((s) => s.source);
  const apiOnline = useStore((s) => s.apiOnline);
  const llm = useStore((s) => s.llmOnline);
  const seed = useStore((s) => s.seed);
  const locked = useStore((s) => s.seedLocked);
  const latency = useStore((s) => s.snap?.stats.latencyMs ?? 0);
  const tickMs = useStore((s) => s.snap?.stats.tickMs ?? 0);
  const label = source === 'api' ? 'API engine' : source === 'api-lost' ? 'API lost → local engine' : source === 'worker-restarted' ? 'Engine auto-restarted' : 'Local engine';
  const warn = source === 'api-lost' || source === 'worker-restarted';
  return (
    <span className={`chip hidden md:inline-flex ${warn ? 'border-sev-orange/50 text-sev-orange' : ''}`} title={`Data source: ${label}. API ${apiOnline ? 'online' : 'offline (optional)'}${llm ? ', LLM proxy on' : ''}. Seed ${seed}${locked ? ' (locked)' : ''}. Feed latency ${latency} ms, engine tick ${tickMs.toFixed(1)} ms.`}>
      {source === 'worker-restarted' ? <RefreshCw className="h-3 w-3" /> : apiOnline ? <Cloud className="h-3 w-3 text-sev-green" /> : <CloudOff className="h-3 w-3 text-slate-400" />}
      <span>{label}</span>
      <span className="text-slate-500">·</span>
      <span className="font-mono tnum">{latency} ms</span>
      {locked && (
        <>
          <span className="text-slate-500">·</span>
          <Lock className="h-3 w-3 text-volt" />
          <span className="font-mono">{seed}</span>
        </>
      )}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <AnimatedNumber value={value} className={`font-mono text-lg font-semibold leading-none ${accent ?? 'text-white'}`} />
    </div>
  );
}
