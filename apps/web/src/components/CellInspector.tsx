import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Crosshair, MapPin, TriangleAlert, Wind, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { MultiTaskProbs, StormCell } from '@vajra/contracts';
import { selectedCell, useStore } from '../store';
import { STAGE_LABEL, TYPE_LABEL, compass, distanceKm, fmtIST, fx } from '../lib/format';
import { Sparkline } from './Sparkline';
import { SeverityBadge } from './SeverityBadge';
import { XaiPanel } from './XaiPanel';
import { AnimatedNumber } from './AnimatedNumber';
import { flyToCell } from './MapView';
import { TOWNS, blockAndPanchayat } from '../engine/places';
import { moveKm } from '../engine/geo';

const PROB_LABEL: Record<keyof MultiTaskProbs, string> = { thunderstorm: 'Thunderstorm', lightning: 'Lightning', hail: 'Hail', gust50: 'Gust > 50 km/h', heavyRain: 'Heavy rain' };

function etas(c: StormCell) {
  const out: { name: string; kind: string; eta: number; dist: number }[] = [];
  for (const t of TOWNS) {
    const d = distanceKm(c.lng, c.lat, t.lng, t.lat);
    if (d > 180) continue;
    for (let m = 0; m <= 180; m += 5) {
      const [lng, lat] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * m) / 60);
      if (distanceKm(lng, lat, t.lng, t.lat) < c.radiusKm + 6) {
        out.push({ name: t.name, kind: 'town', eta: m, dist: d });
        break;
      }
    }
  }
  // panchayats along the track
  for (const m of [20, 45, 75]) {
    const [lng, lat] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * m) / 60);
    const bp = blockAndPanchayat(lng, lat);
    out.push({ name: `${bp.panchayat}, ${bp.block}`, kind: 'panchayat', eta: m, dist: distanceKm(c.lng, c.lat, lng, lat) });
  }
  return out.sort((a, b) => a.eta - b.eta).slice(0, 6);
}

export function CellInspector() {
  const c = useStore(selectedCell);
  const select = useStore((s) => s.select);
  const simTime = useStore((s) => s.snap?.stats.simTime ?? 0);
  const nav = useNavigate();
  const [target, setTarget] = useState<keyof MultiTaskProbs>('thunderstorm');
  const eta = useMemo(() => (c ? etas(c) : []), [c?.id, Math.round((c?.lng ?? 0) * 50), Math.round((c?.lat ?? 0) * 50)]);
  if (!c) return null;
  const h = c.history;
  return (
    <motion.aside initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="panel pointer-events-auto flex max-h-full w-[400px] flex-col overflow-hidden">
      <div className="flex items-start justify-between border-b border-white/5 p-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl font-bold text-white">{c.id}</span>
            <SeverityBadge severity={c.severity} withAction />
            {c.injected && <span className="chip text-plasma">director</span>}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {TYPE_LABEL[c.type]} · {STAGE_LABEL[c.stage]} · age {Math.round(c.ageMin)} min
          </div>
        </div>
        <div className="flex gap-1">
          <button className="btn h-7 w-7 p-0" title="Centre map" onClick={() => flyToCell(c)}>
            <Crosshair className="h-3.5 w-3.5" />
          </button>
          <button className="btn h-7 w-7 p-0" title="3D view" onClick={() => nav('/storm3d')}>
            <Box className="h-3.5 w-3.5" />
          </button>
          <button className="btn h-7 w-7 p-0" onClick={() => select(null)} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="scroll-thin space-y-3 overflow-y-auto p-3">
        {/* lifecycle */}
        <div className="flex gap-1">
          {(['initiation', 'growth', 'mature', 'decay'] as const).map((s) => (
            <div key={s} className={`flex-1 rounded px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-wider ${c.stage === s ? 'bg-volt/20 text-volt ring-1 ring-volt/50' : 'bg-white/[0.03] text-slate-500'}`}>
              {STAGE_LABEL[s]}
            </div>
          ))}
        </div>
        {/* flags */}
        <div className="flex flex-wrap gap-1.5">
          {c.lightningJump && (
            <span className="chip border-volt/50 bg-volt/15 text-volt">
              <Zap className="h-3 w-3" /> Lightning jump +{fx(c.jumpSigma)}σ
            </span>
          )}
          {c.hail && <span className="chip border-sev-orange/50 text-sev-orange"><TriangleAlert className="h-3 w-3" /> Hail</span>}
          {c.downburst && <span className="chip border-sev-red/50 text-sev-red"><Wind className="h-3 w-3" /> Downburst</span>}
          <span className="chip">
            → {compass(c.headingDeg)} {Math.round(c.headingDeg)}° · <span className="tnum">{Math.round(c.speedKmh)}</span> km/h
          </span>
        </div>
        {/* radar / sat metrics with sparklines */}
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Max reflectivity" value={c.maxDbz} unit="dBZ" d={0} series={h.map((x) => x.maxDbz)} color="#fb923c" />
          <Metric label="Echo top" value={c.echoTopKm} unit="km" d={1} series={h.map((x) => x.echoTopKm)} color="#a78bfa" />
          <Metric label="VIL" value={c.vil} unit="kg/m²" d={0} series={h.map((x) => x.vil)} color="#60a5fa" />
          <Metric label="Flash rate" value={c.flashRate} unit="fl/min" d={1} series={h.map((x) => x.flashRate)} color="#22d3ee" />
          <Metric label="Cloud-top temp" value={c.cttK} unit="K" d={0} series={h.map((x) => x.cttK)} color="#e879f9" />
          <Metric label="CTT cooling" value={c.cttCoolingK15} unit="K/15min" d={1} series={[]} color="#e879f9" />
        </div>
        {/* environment */}
        <div className="grid grid-cols-4 gap-2 rounded-lg bg-white/[0.03] p-2 text-center">
          {[
            ['CAPE', c.env.capeJkg, 'J/kg', 0],
            ['CIN', c.env.cinJkg, 'J/kg', 0],
            ['Shear 0-6', c.env.shear06, 'm/s', 0],
            ['PW', c.env.pwMm, 'mm', 0],
          ].map(([l, v, u, d]) => (
            <div key={l as string}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{l}</div>
              <AnimatedNumber value={v as number} decimals={d as number} className="font-mono text-sm font-semibold text-white" />
              <div className="text-[9px] text-slate-500">{u}</div>
            </div>
          ))}
        </div>
        {/* multi-task */}
        <div>
          <div className="panel-title mb-1.5">Multi-task nowcast (next 60 min)</div>
          <div className="space-y-1">
            {(Object.keys(PROB_LABEL) as (keyof MultiTaskProbs)[]).map((k) => (
              <button key={k} onClick={() => setTarget(k)} className={`grid w-full grid-cols-[110px_1fr_44px] items-center gap-2 rounded px-1 text-left text-[12px] ${target === k ? 'bg-white/5' : ''}`}>
                <span className="text-slate-300">{PROB_LABEL[k]}</span>
                <div className="h-2 rounded-full bg-white/5">
                  <div className="h-2 rounded-full bg-gradient-to-r from-plasma to-volt" style={{ width: `${c.probs[k] * 100}%`, transition: 'width 400ms ease-out' }} />
                </div>
                <AnimatedNumber value={c.probs[k] * 100} className="text-right font-mono text-slate-100" suffix="%" />
              </button>
            ))}
          </div>
        </div>
        <XaiPanel xai={c.xai} />
        {/* ETA */}
        <div>
          <div className="panel-title mb-1.5 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> ETA — districts & panchayats in path
          </div>
          {eta.length === 0 && <div className="text-xs text-slate-500">No settlements in the 3 h path.</div>}
          <div className="space-y-1">
            {eta.map((e) => (
              <div key={e.name} className="flex items-center justify-between rounded bg-white/[0.03] px-2 py-1 text-[12px]">
                <span className="truncate text-slate-200">
                  {e.name} <span className="text-[10px] text-slate-500">{e.kind}</span>
                </span>
                <span className={`font-mono tnum ${e.eta <= 30 ? 'text-sev-red' : e.eta <= 60 ? 'text-sev-orange' : 'text-slate-300'}`}>
                  {e.eta === 0 ? 'NOW' : `${e.eta} min`} · {fmtIST(simTime + e.eta * 60000)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.aside>
  );
}

function Metric({ label, value, unit, d, series, color }: { label: string; value: number; unit: string; d: number; series: number[]; color: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="flex items-end justify-between">
        <div>
          <AnimatedNumber value={value} decimals={d} className="font-mono text-lg font-semibold text-white" />
          <span className="ml-1 text-[10px] text-slate-500">{unit}</span>
        </div>
        <Sparkline values={series.slice(-30)} color={color} width={70} height={24} />
      </div>
    </div>
  );
}
