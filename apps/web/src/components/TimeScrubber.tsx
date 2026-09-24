import { Pause, Play, RotateCcw } from 'lucide-react';
import { useStore } from '../store';
import { fmtIST } from '../lib/format';

/** -120 min (history) ... 0 (now) ... +180 min (nowcast). */
export function TimeScrubber() {
  const scrub = useStore((s) => s.scrubMin);
  const setScrub = useStore((s) => s.setScrub);
  const playing = useStore((s) => s.playing);
  const setPlaying = useStore((s) => s.setPlaying);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const simTime = useStore((s) => s.snap?.stats.simTime ?? 0);
  const frame = useStore((s) => s.frame);
  const pct = ((scrub + 120) / 300) * 100;
  const label = scrub === 0 ? 'LIVE' : scrub < 0 ? `T${scrub} min · observed` : `T+${scrub} min · nowcast`;
  return (
    <div className="panel pointer-events-auto flex items-center gap-3 px-3 py-2">
      <button className="btn h-8 w-8 p-0" onClick={() => setPlaying(!playing)} aria-label="play/pause">
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="flex gap-0.5">
        {[1, 5, 20].map((v) => (
          <button key={v} onClick={() => setSpeed(v)} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${speed === v ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/10'}`}>
            {v}×
          </button>
        ))}
      </div>
      <div className="relative flex-1 px-1">
        <div className="relative h-7">
          <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-gradient-to-r from-slate-600/60 via-slate-500/60 to-transparent" />
          <div className="absolute top-3 h-1.5 rounded-full bg-gradient-to-r from-fuchsia-400/70 via-violet-400/60 to-cyan-400/50" style={{ left: '40%', right: 0 }} />
          <div className="absolute top-1 h-5 w-px bg-sev-red" style={{ left: '40%' }} />
          {[-120, -60, 0, 30, 60, 120, 180].map((m) => (
            <div key={m} className="absolute top-5 -translate-x-1/2 font-mono text-[9px] text-slate-500" style={{ left: `${((m + 120) / 300) * 100}%` }}>
              {m === 0 ? 'NOW' : m > 0 ? `+${m}` : m}
            </div>
          ))}
          <input
            type="range"
            min={-120}
            max={180}
            step={5}
            value={scrub}
            onChange={(e) => setScrub(Number(e.target.value))}
            className="absolute inset-x-0 top-1 h-5 w-full cursor-pointer opacity-0"
            aria-label="Time scrubber"
          />
          <div className="pointer-events-none absolute top-1.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-volt shadow-glow" style={{ left: `${pct}%` }} />
        </div>
      </div>
      <div className="w-[190px] text-right">
        <div className={`font-mono text-sm font-semibold tnum ${scrub === 0 ? 'text-sev-red' : scrub > 0 ? 'text-plasma-soft' : 'text-slate-200'}`}>{label}</div>
        <div className="font-mono text-[11px] text-slate-500 tnum">{fmtIST(frame?.t ?? simTime + scrub * 60000)} IST</div>
      </div>
      {scrub !== 0 && (
        <button className="btn h-8 px-2" onClick={() => setScrub(0)} title="Back to live">
          <RotateCcw className="h-3.5 w-3.5" /> Live
        </button>
      )}
    </div>
  );
}
