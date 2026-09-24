import { useMemo, useState } from 'react';
import { Cpu, Plug, Radar, Satellite, ShieldCheck, Zap, Thermometer, CloudCog } from 'lucide-react';
import type { SensorStatus } from '@vajra/contracts';
import { useStore } from '../store';
import { Sparkline } from '../components/Sparkline';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { FEED_ADAPTERS } from '../data/adapters';
import { distanceKm } from '../lib/format';
import { HELP } from '../lib/help';
import { FusionDiagram } from '../components/sensors/FusionDiagram';
import { SensorMap } from '../components/sensors/SensorMap';
import { AnomalyTimeline } from '../components/sensors/AnomalyTimeline';
import { useSimNow } from '../lib/useNow';

const KIND: Record<SensorStatus['kind'], { label: string; Icon: typeof Cpu }> = {
  dwr: { label: 'Doppler radar', Icon: Radar },
  satellite: { label: 'Satellite', Icon: Satellite },
  lightning: { label: 'Lightning sensor', Icon: Zap },
  aws: { label: 'AWS', Icon: Thermometer },
  nwp: { label: 'NWP model', Icon: CloudCog },
};
const STATE_CLS: Record<SensorStatus['state'], string> = {
  ok: 'text-sev-green border-sev-green/40 bg-sev-green/10',
  degraded: 'text-sev-yellow border-sev-yellow/40 bg-sev-yellow/10',
  excluded: 'text-sev-red border-sev-red/50 bg-sev-red/10',
  recovering: 'text-volt border-volt/40 bg-volt/10',
};

export default function SensorHealth() {
  const sensors = useStore((s) => s.snap?.sensors ?? []);
  const sc = useStore((s) => s.snap?.scenario);
  const events = useStore((s) => s.snap?.events ?? []);
  const now = useSimNow();
  const [kind, setKind] = useState<SensorStatus['kind'] | 'all'>('all');
  const [nearOnly, setNearOnly] = useState(true);
  const list = useMemo(
    () =>
      sensors
        .filter((s) => kind === 'all' || s.kind === kind)
        .filter((s) => !nearOnly || !sc || s.kind !== 'dwr' || distanceKm(s.lng, s.lat, sc.center[0], sc.center[1]) < 600)
        .sort((a, b) => a.trust - b.trust),
    [sensors, kind, nearOnly, sc],
  );
  const counts = (['ok', 'degraded', 'excluded', 'recovering'] as const).map((st) => ({ st, n: sensors.filter((s) => s.state === st).length }));
  const fusionTrust = sensors.length ? sensors.filter((s) => s.state !== 'excluded').reduce((a, s) => a + s.trust, 0) / sensors.length : 0;

  return (
    <div className="scroll-thin h-full space-y-3 overflow-y-auto p-3">
      <div className="grid grid-cols-6 gap-3">
        <div className="panel col-span-2 flex items-center gap-3 p-3" title={HELP.trust}>
          <ShieldCheck className="h-9 w-9 text-volt" />
          <div>
            <div className="panel-title">Data-fusion trust</div>
            <AnimatedNumber value={fusionTrust * 100} decimals={1} suffix="%" className="font-mono text-3xl font-bold text-white" />
            <div className="text-[12px] text-slate-400">Bad inputs are auto-excluded, then re-admitted after probation.</div>
          </div>
        </div>
        {counts.map((c) => (
          <div key={c.st} className="panel p-3">
            <div className="panel-title">{c.st}</div>
            <AnimatedNumber value={c.n} className={`font-mono text-3xl font-bold ${STATE_CLS[c.st].split(' ')[0]}`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="panel p-3">
              <div className="panel-title mb-2">Fusion pipeline (live)</div>
              <FusionDiagram sensors={sensors} />
            </div>
            <div className="panel p-3">
              <div className="panel-title mb-2">Anomaly timeline (last 60 min)</div>
              <AnomalyTimeline events={events} now={now} />
            </div>
          </div>
          <div className="panel min-w-0 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {(['all', 'dwr', 'satellite', 'lightning', 'aws', 'nwp'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`rounded-md px-2 py-0.5 text-xs ${kind === k ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/5'}`}
                >
                  {k === 'all' ? 'All' : KIND[k].label}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" className="accent-amber-400" checked={nearOnly} onChange={(e) => setNearOnly(e.target.checked)} /> Only radars near the scenario
              </label>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="py-1">Sensor</th>
                  <th>State</th>
                  <th>Anomaly</th>
                  <th className="text-right" title={HELP.latency}>
                    Latency
                  </th>
                  <th className="text-right">Uptime</th>
                  <th className="text-right" title={HELP.trust}>
                    Trust
                  </th>
                  <th className="pl-3">Signal</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const K = KIND[s.kind];
                  return (
                    <tr key={s.id} className="border-t border-white/5">
                      <td className="py-1.5">
                        <span className="flex items-center gap-2">
                          <K.Icon className="h-3.5 w-3.5 text-slate-400" />
                          {s.name}
                        </span>
                      </td>
                      <td>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATE_CLS[s.state]}`}>{s.state}</span>
                      </td>
                      <td className="text-xs text-sev-orange">{s.anomaly ?? <span className="text-slate-600">—</span>}</td>
                      <td className="text-right font-mono tnum">{s.latencySec < 120 ? `${s.latencySec.toFixed(1)} s` : `${(s.latencySec / 60).toFixed(1)} min`}</td>
                      <td className="text-right font-mono tnum">{s.uptimePct.toFixed(2)}%</td>
                      <td className="text-right">
                        <div className="ml-auto flex w-24 items-center gap-1.5">
                          <div className="h-1.5 flex-1 rounded-full bg-white/5">
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: `${s.trust * 100}%`, background: s.trust > 0.8 ? '#22c55e' : s.trust > 0.45 ? '#facc15' : '#ef4444', transition: 'width 400ms' }}
                            />
                          </div>
                          <span className="w-9 font-mono text-[11px] tnum">{(s.trust * 100).toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="pl-3">
                        <Sparkline values={s.series.slice(-30)} width={90} height={20} color={s.state === 'ok' ? '#f5a524' : '#fb923c'} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-3">
          <div className="panel p-3">
            <div className="panel-title mb-2">Network map</div>
            {sc && <SensorMap sensors={sensors} focus={sc.bbox} />}
          </div>
          <div className="panel p-3">
            <div className="panel-title mb-2">Detectors</div>
            <ul className="space-y-1.5 text-[12px] text-slate-300">
              <li>
                <b className="text-white">Spike</b> — reading far from the neighbour consensus (&gt; 6 units), twice in a row
              </li>
              <li>
                <b className="text-white">Frozen</b> — 8 identical readings in a row
              </li>
              <li>
                <b className="text-white">Drift</b> — steady offset from consensus &gt; 2.5 units
              </li>
              <li>
                <b className="text-white">Dropout</b> — no data for &gt; 3× the expected latency
              </li>
              <li className="text-slate-400">Trust &lt; 45% → excluded from fusion; after 10 clean minutes → back to OK.</li>
            </ul>
          </div>
          <div className="panel p-3">
            <div className="panel-title mb-2 flex items-center gap-1.5">
              <Plug className="h-3.5 w-3.5" /> Real-feed adapters (same interface)
            </div>
            <div className="space-y-2">
              {FEED_ADAPTERS.map((f) => (
                <div key={f.id} className="rounded-lg bg-white/[0.03] p-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <b className="text-slate-100">{f.name}</b>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-400">{f.status}</span>
                  </div>
                  <div className="text-slate-400">
                    {f.product} · {f.format} · {f.cadence}
                  </div>
                  <div className="text-slate-500">→ {f.mapsTo}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
