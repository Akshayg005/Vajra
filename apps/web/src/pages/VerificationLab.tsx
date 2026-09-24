import { useMemo, useState } from 'react';
import { Gauge, Info } from 'lucide-react';
import type { VerificationScore } from '@vajra/contracts';
import { useStore } from '../store';
import { AXIS, EChart } from '../components/EChart';
import { AnimatedNumber } from '../components/AnimatedNumber';

const METHOD: Record<VerificationScore['method'], { label: string; color: string }> = {
  vajra: { label: 'VAJRA (AI nowcast)', color: '#f5a524' },
  optical_flow: { label: 'Optical-flow extrapolation', color: '#5aa9ff' },
  persistence: { label: 'Persistence', color: '#64748b' },
};
const METRICS = ['csi', 'pod', 'far', 'ets', 'fss', 'brier'] as const;
type Metric = (typeof METRICS)[number];
const M_LABEL: Record<Metric, string> = { csi: 'CSI', pod: 'POD', far: 'FAR', ets: 'ETS', fss: 'FSS (24 km)', brier: 'Brier score' };
const LOWER_BETTER: Metric[] = ['far', 'brier'];

export default function VerificationLab() {
  const v = useStore((s) => s.snap?.verification);
  const [metric, setMetric] = useState<Metric>('csi');
  const [lead, setLead] = useState(60);
  const scores = useMemo(() => v?.scores ?? [], [v?.scores]);
  const skillOpt = useMemo(() => {
    const byMethod = (m: VerificationScore['method']) => scores.filter((s) => s.method === m).sort((a, b) => a.leadMin - b.leadMin);
    return {
      grid: { left: 48, right: 16, top: 30, bottom: 36 },
      legend: { top: 0, textStyle: { color: '#cbd5e1', fontSize: 11 } },
      tooltip: { trigger: 'axis', backgroundColor: '#0b1120', borderColor: '#334155', textStyle: { color: '#e2e8f0' } },
      xAxis: { type: 'value', name: 'Lead time (min)', nameLocation: 'middle', nameGap: 24, min: 30, max: 180, interval: 30, ...AXIS },
      yAxis: { type: 'value', min: 0, max: metric === 'brier' ? 0.8 : 1, ...AXIS },
      series: (['vajra', 'optical_flow', 'persistence'] as const).map((m) => ({
        name: METHOD[m].label,
        type: 'line',
        smooth: true,
        symbolSize: 7,
        lineStyle: { width: m === 'vajra' ? 3 : 2, color: METHOD[m].color, type: m === 'persistence' ? 'dashed' : 'solid' },
        itemStyle: { color: METHOD[m].color },
        data: byMethod(m).map((s) => [s.leadMin, +s[metric].toFixed(3)]),
      })),
    };
  }, [scores, metric]);

  const relOpt = useMemo(() => {
    const rel = (v?.reliability ?? []).filter((r) => Number.isFinite(r.observed) && r.count > 5);
    return {
      grid: { left: 48, right: 16, top: 16, bottom: 40 },
      tooltip: { trigger: 'item', backgroundColor: '#0b1120', borderColor: '#334155', textStyle: { color: '#e2e8f0' } },
      xAxis: { type: 'value', min: 0, max: 1, name: 'Forecast probability', nameLocation: 'middle', nameGap: 26, ...AXIS },
      yAxis: { type: 'value', min: 0, max: 1, name: 'Observed frequency', ...AXIS },
      series: [
        {
          type: 'line',
          data: [
            [0, 0],
            [1, 1],
          ],
          symbol: 'none',
          lineStyle: { color: '#475569', type: 'dashed' },
          silent: true,
        },
        {
          type: 'line',
          name: 'VAJRA 60 min',
          data: rel.map((r) => [+r.forecast.toFixed(3), +r.observed.toFixed(3), r.count]),
          symbolSize: (d: number[]) => 4 + Math.min(14, Math.log10(d[2] + 1) * 4),
          lineStyle: { color: '#f5a524', width: 2.5 },
          itemStyle: { color: '#f5a524' },
        },
        {
          type: 'bar',
          data: rel.map((r) => [+r.forecast.toFixed(3), Math.min(1, Math.log10(r.count + 1) / 6)]),
          barWidth: 6,
          itemStyle: { color: 'rgba(90,169,255,0.3)' },
          silent: true,
        },
      ],
    };
  }, [v?.reliability]);

  const at = (m: VerificationScore['method']) => scores.find((s) => s.method === m && s.leadMin === lead);
  const vj = at('vajra');
  const of = at('optical_flow');
  const skill = vj && of && of.csi > 0 ? (vj.csi - of.csi) / Math.max(0.01, 1 - of.csi) : 0;

  return (
    <div className="scroll-thin h-full space-y-3 overflow-y-auto p-3">
      <div className="panel flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-volt" />
          <div>
            <div className="text-sm font-semibold text-white">Verification Lab — honest, rolling scores</div>
            <div className="text-xs text-slate-400">
              Every 10 min each method issues 30/60/120/180-min forecasts; each is scored when its valid time arrives (≥35 dBZ event, 8 km grid, 1-pixel tolerance).
            </div>
          </div>
        </div>
        <div className="text-right font-mono text-xs text-slate-400">
          <AnimatedNumber value={v?.samples ?? 0} className="text-lg font-semibold text-white" /> forecasts verified
        </div>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-3">
        <div className="panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="panel-title">Skill vs lead time</span>
            <div className="flex gap-1">
              {METRICS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`rounded-md px-2 py-0.5 font-mono text-xs ${metric === m ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/5'}`}
                >
                  {M_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <EChart option={skillOpt} height={300} />
          <div className="mt-1 text-[11px] text-slate-500">
            {LOWER_BETTER.includes(metric) ? 'Lower is better.' : 'Higher is better.'} Scores are exponentially weighted over recent verifications, so they drift with the weather.
          </div>
        </div>
        <div className="panel p-3">
          <div className="panel-title mb-2">Reliability diagram (VAJRA, 60 min)</div>
          <EChart option={relOpt} height={300} />
          <div className="text-[11px] text-slate-500">Points below the diagonal = over-forecasting. Bars show sample counts (log).</div>
        </div>
      </div>

      <div className="panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="panel-title">Scorecard</span>
          <div className="flex gap-1">
            {[30, 60, 120, 180].map((l) => (
              <button
                key={l}
                onClick={() => setLead(l)}
                className={`rounded-md px-2 py-0.5 font-mono text-xs ${lead === l ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/5'}`}
              >
                T+{l}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="py-1.5">Method</th>
              {METRICS.map((m) => (
                <th key={m} className="text-right">
                  {M_LABEL[m]}
                </th>
              ))}
              <th className="text-right">Hits</th>
              <th className="text-right">Misses</th>
              <th className="text-right">False al.</th>
              <th className="text-right">N</th>
            </tr>
          </thead>
          <tbody>
            {(['vajra', 'optical_flow', 'persistence'] as const).map((m) => {
              const s = at(m);
              return (
                <tr key={m} className="border-t border-white/5">
                  <td className="py-2">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: METHOD[m].color }} />
                    {METHOD[m].label}
                  </td>
                  {METRICS.map((k) => (
                    <td key={k} className="text-right font-mono tnum">
                      {s ? <AnimatedNumber value={s[k]} decimals={k === 'brier' ? 3 : 2} /> : '—'}
                    </td>
                  ))}
                  <td className="text-right font-mono tnum text-slate-400">{s?.table.hits ?? '—'}</td>
                  <td className="text-right font-mono tnum text-slate-400">{s?.table.misses ?? '—'}</td>
                  <td className="text-right font-mono tnum text-slate-400">{s?.table.falseAlarms ?? '—'}</td>
                  <td className="text-right font-mono tnum text-slate-400">{s?.n ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/[0.03] p-2.5 text-[12px] text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-volt" />
          <span>
            CSI skill of VAJRA over optical flow at T+{lead}: <b className="font-mono text-white">{(skill * 100).toFixed(0)}%</b>. VAJRA adds a growth/decay term and a
            convective-initiation term to plain advection, which is why its advantage grows with lead time. New storms that have not formed yet stay the main source of misses — no
            method is near-perfect beyond 2 h.
          </span>
        </div>
      </div>
    </div>
  );
}
