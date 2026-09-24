import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, History, Play } from 'lucide-react';
import { useStore } from '../store';
import { DENSITY, gridToImage, lutCss } from '../lib/colormap';
import { drawGeo, useGeo } from '../lib/geoCanvas';
import { AXIS, EChart } from '../components/EChart';
import { SCENARIOS } from '../engine/scenarios';
import { DISTRICTS } from '../engine/places';
import { AnimatedNumber } from '../components/AnimatedNumber';

export default function Analytics() {
  const snap = useStore((s) => s.snap)!;
  const send = useStore((s) => s.send);
  const setSpeed = useStore((s) => s.setSpeed);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(snap.scenario.id);
  const states = useGeo('/geo/india-states.geojson');
  const districts = useGeo('/geo/india-districts.geojson');
  // the density grid only changes every ~5 s; keep the last posted field so heavy work runs only then
  const [d, setD] = useState(snap.density);
  useEffect(() => {
    if (snap.changed.density || snap.density.width !== d.width || snap.scenario.id !== scenarioRef.current) {
      scenarioRef.current = snap.scenario.id;
      setD(snap.density);
    }
  }, [snap, d.width]);
  const bboxKey = d.bbox.join(',');

  // density-cell -> district lookup, built once per domain
  const W0 = d.width;
  const H0 = d.height;
  const lookup = useMemo(() => {
    const [w, s, e, n] = bboxKey.split(',').map(Number);
    const idx = new Int16Array(W0 * H0);
    const dLng = (e - w) / W0;
    const dLat = (n - s) / H0;
    const cand = DISTRICTS.map((x, i) => ({ ...x, i })).filter((x) => x.lng > w - 1 && x.lng < e + 1 && x.lat > s - 1 && x.lat < n + 1);
    for (let j = 0; j < H0; j++)
      for (let i = 0; i < W0; i++) {
        const lng = w + (i + 0.5) * dLng;
        const lat = n - (j + 0.5) * dLat;
        let best = -1;
        let bd = 0.5 * 0.5;
        for (const c of cand) {
          const dd = (c.lng - lng) ** 2 + (c.lat - lat) ** 2;
          if (dd < bd) {
            bd = dd;
            best = c.i;
          }
        }
        idx[j * W0 + i] = best;
      }
    return idx;
  }, [bboxKey, W0, H0]);

  const ranking = useMemo(() => {
    const sums = new Map<number, number>();
    for (let k = 0; k < d.data.length; k++) {
      const di = lookup[k];
      if (di < 0 || d.data[k] < 0.01) continue;
      sums.set(di, (sums.get(di) ?? 0) + d.data[k]);
    }
    return [...sums.entries()]
      .map(([i, v]) => ({ name: DISTRICTS[i].name, state: DISTRICTS[i].state, v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 12);
  }, [d, lookup]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    ctx.fillStyle = '#03050a';
    ctx.fillRect(0, 0, W, H);
    if (districts) drawGeo(ctx, districts, d.bbox, W, H, { stroke: '#1f2a40', width: 0.6, fill: '#0c1528' });
    const img = gridToImage(d, DENSITY);
    const tmp = document.createElement('canvas');
    tmp.width = d.width;
    tmp.height = d.height;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(tmp, 0, 0, W, H);
    ctx.globalAlpha = 1;
    if (states) drawGeo(ctx, states, d.bbox, W, H, { stroke: '#64748b', width: 1.2 });
  }, [d, states, districts]);

  const strikes = snap.strikes;
  const cg = useMemo(() => strikes.filter((s) => s.kind === 'CG'), [strikes]);
  const pos = cg.filter((s) => s.polarity > 0).length;
  const bins = useMemo(() => {
    const t = snap.stats.simTime;
    const arr = Array.from({ length: 10 }, (_, i) => ({ t: -20 + i * 2, cg: 0, ic: 0 }));
    for (const s of strikes) {
      const k = Math.floor((s.t - (t - 20 * 60000)) / 120000);
      if (k < 0 || k >= 10) continue;
      if (s.kind === 'CG') arr[k].cg++;
      else arr[k].ic++;
    }
    return arr;
  }, [strikes, snap.stats.simTime]);
  const hist = useMemo(() => {
    const b = [0, 10, 20, 30, 40, 60, 80, 120];
    const c = b.map(() => 0);
    for (const s of cg) {
      let i = b.findIndex((x, k) => s.peakKa >= x && (k === b.length - 1 || s.peakKa < b[k + 1]));
      if (i < 0) i = 0;
      c[i]++;
    }
    return b.map((x, i) => [i === b.length - 1 ? `${x}+` : `${x}-${b[i + 1]}`, c[i]]);
  }, [cg]);

  return (
    <div className="scroll-thin h-full space-y-3 overflow-y-auto p-3">
      <div className="grid grid-cols-[1fr_380px] gap-3">
        <div className="panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="panel-title flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> CG lightning density (decayed, e-fold 6 h, 5 km grid)
            </span>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <div className="h-2 w-32 rounded" style={{ background: lutCss(DENSITY) }} /> 0 → 12+ strikes / 25 km²
            </div>
          </div>
          <canvas
            ref={canvas}
            width={1000}
            height={Math.round((1000 * (d.bbox[3] - d.bbox[1])) / (d.bbox[2] - d.bbox[0]) / Math.cos((((d.bbox[1] + d.bbox[3]) / 2) * Math.PI) / 180))}
            className="w-full rounded-lg"
          />
        </div>
        <div className="space-y-3">
          <div className="panel p-3">
            <div className="panel-title mb-2">District ranking (CG density)</div>
            {ranking.map((r, i) => (
              <div key={r.name} className="flex items-center gap-2 py-0.5 text-[12px]">
                <span className="w-5 font-mono text-slate-500">{i + 1}</span>
                <span className="flex-1 truncate text-slate-200">
                  {r.name} <span className="text-slate-500">{r.state}</span>
                </span>
                <div className="h-1.5 w-24 rounded-full bg-white/5">
                  <div className="h-1.5 rounded-full bg-gradient-to-r from-plasma to-volt" style={{ width: `${(r.v / (ranking[0]?.v || 1)) * 100}%` }} />
                </div>
                <span className="w-10 text-right font-mono tnum text-slate-300">{Math.round(r.v)}</span>
              </div>
            ))}
            {!ranking.length && <div className="text-xs text-slate-500">Accumulating…</div>}
          </div>
          <div className="panel p-3">
            <div className="panel-title mb-2 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Replay scenario presets
            </div>
            <div className="space-y-1">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={async () => {
                    await send({ type: 'scenario', id: s.id });
                    setSpeed(20);
                  }}
                  className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs ${snap.scenario.id === s.id ? 'border-volt/50 bg-volt/10 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
                >
                  {s.name}
                  <Play className="h-3.5 w-3.5 text-volt" />
                </button>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">Loads the preset and replays at 20× (3 h in ~18 s).</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="panel p-3">
          <div className="panel-title mb-1">Strikes per 2 min (last 20 min)</div>
          <EChart
            height={200}
            option={{
              grid: { left: 36, right: 8, top: 24, bottom: 24 },
              legend: { top: 0, textStyle: { color: '#cbd5e1', fontSize: 11 } },
              tooltip: { trigger: 'axis' },
              xAxis: { type: 'category', data: bins.map((b) => `${b.t}`), ...AXIS },
              yAxis: { type: 'value', ...AXIS },
              series: [
                { name: 'CG', type: 'bar', stack: 's', data: bins.map((b) => b.cg), itemStyle: { color: '#67e8f9' } },
                { name: 'IC', type: 'bar', stack: 's', data: bins.map((b) => b.ic), itemStyle: { color: '#7c3aed' } },
              ],
            }}
          />
        </div>
        <div className="panel p-3">
          <div className="panel-title mb-1">CG peak current (kA)</div>
          <EChart
            height={200}
            option={{
              grid: { left: 36, right: 8, top: 10, bottom: 24 },
              xAxis: { type: 'category', data: hist.map((h) => h[0]), ...AXIS },
              yAxis: { type: 'value', ...AXIS },
              series: [{ type: 'bar', data: hist.map((h) => h[1]), itemStyle: { color: '#a78bfa', borderRadius: [3, 3, 0, 0] } }],
            }}
          />
        </div>
        <div className="panel grid grid-cols-2 gap-3 p-3">
          <Kpi label="Strikes (session)" v={snap.stats.strikesTotal} />
          <Kpi label="Strikes last 20 min" v={strikes.length} />
          <Kpi label="CG share" v={strikes.length ? (cg.length / strikes.length) * 100 : 0} suffix="%" />
          <Kpi label="+CG share" v={cg.length ? (pos / cg.length) * 100 : 0} suffix="%" d={1} />
          <Kpi label="Max flash rate" v={Math.max(0, ...snap.cells.map((c) => c.flashRate))} suffix=" fl/min" d={1} />
          <Kpi label="Lightning jumps now" v={snap.cells.filter((c) => c.lightningJump).length} />
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, suffix = '', d = 0 }: { label: string; v: number; suffix?: string; d?: number }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <AnimatedNumber value={v} decimals={d} suffix={suffix} className="font-mono text-xl font-semibold text-white" />
    </div>
  );
}
