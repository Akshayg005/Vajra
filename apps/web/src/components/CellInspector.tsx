import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Crosshair, MapPin, TriangleAlert, Wind, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { MultiTaskProbs, StormCell } from '@vajra/contracts';
import { selectedCell, useStore } from '../store';
import { STAGE_LABEL, TYPE_LABEL, compass, distanceKm, fmtIST } from '../lib/format';
import { HELP, degC, n0 } from '../lib/help';
import { Sparkline } from './Sparkline';
import { SeverityBadge } from './SeverityBadge';
import { XaiPanel } from './XaiPanel';
import { AnimatedNumber } from './AnimatedNumber';
import { flyToCell } from './MapView';
import { TOWNS, blockAndPanchayat } from '../engine/places';
import { moveKm } from '../engine/geo';

const PROB_LABEL: Record<keyof MultiTaskProbs, string> = { thunderstorm: 'Thunderstorm', lightning: 'Lightning', hail: 'Hail', gust50: 'Gust > 50 km/h', heavyRain: 'Heavy rain' };

interface Eta {
  name: string;
  kind: 'town' | 'panchayat';
  eta: number;
  dist: number;
}

function etas(c: StormCell): Eta[] {
  const out: Eta[] = [];
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
  for (const m of [20, 45, 75]) {
    const [lng, lat] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * m) / 60);
    const bp = blockAndPanchayat(lng, lat);
    out.push({ name: `${bp.panchayat}, ${bp.block}`, kind: 'panchayat', eta: m, dist: distanceKm(c.lng, c.lat, lng, lat) });
  }
  return out.sort((a, b) => a.eta - b.eta).slice(0, 7);
}

export function CellInspector() {
  const c = useStore(selectedCell);
  const close = useStore((s) => s.openDetail);
  const simTime = useStore((s) => s.snap?.stats.simTime ?? 0);
  const nav = useNavigate();
  const [target, setTarget] = useState<keyof MultiTaskProbs>('thunderstorm');
  const posKey = c ? `${c.id}:${Math.round(c.lng * 50)}:${Math.round(c.lat * 50)}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eta = useMemo(() => (c ? etas(c) : []), [posKey]);
  if (!c) return null;
  const h = c.history;
  return (
    <motion.aside initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="panel pointer-events-auto flex max-h-full w-[410px] flex-col overflow-hidden" role="dialog" aria-label={`Storm cell ${c.id}`}>
      <div className="flex items-start justify-between border-b border-white/5 p-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl font-bold text-white">{c.id}</span>
            <SeverityBadge severity={c.severity} withAction />
            {c.injected && <span className="chip text-plasma">director</span>}
          </div>
          <div className="mt-0.5 text-xs text-slate-400" title={HELP.stage}>
            {TYPE_LABEL[c.type]} · {STAGE_LABEL[c.stage]} · age {c.ageMin.toFixed(0)} min
          </div>
        </div>
        <div className="flex gap-1">
          <button className="btn h-7 w-7 p-0" title="Centre map on this storm" aria-label="Centre map" onClick={() => flyToCell(c)}>
            <Crosshair className="h-3.5 w-3.5" />
          </button>
          <button className="btn h-7 w-7 p-0" onClick={() => close(null)} aria-label="Close inspector (Esc)">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="scroll-thin space-y-3 overflow-y-auto p-3">
        <div className="flex gap-1" title={HELP.stage}>
          {(['initiation', 'growth', 'mature', 'decay'] as const).map((s) => (
            <div key={s} className={`flex-1 rounded px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-wider ${c.stage === s ? 'bg-volt/20 text-volt ring-1 ring-volt/50' : 'bg-white/[0.03] text-slate-500'}`}>
              {STAGE_LABEL[s]}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.lightningJump && (
            <span className="chip border-volt/50 bg-volt/15 text-volt" title={HELP.jump}>
              <Zap className="h-3 w-3" /> Lightning jump +{c.jumpSigma.toFixed(1)}σ
            </span>
          )}
          {c.hail && (
            <span className="chip border-sev-orange/50 text-sev-orange" title={HELP.vil}>
              <TriangleAlert className="h-3 w-3" /> Hail likely
            </span>
          )}
          {c.downburst && (
            <span className="chip border-sev-red/50 text-sev-red">
              <Wind className="h-3 w-3" /> Downburst risk
            </span>
          )}
          <span className="chip">
            → {compass(c.headingDeg)} {c.headingDeg.toFixed(0)}° · <span className="tnum">{c.speedKmh.toFixed(1)}</span> km/h
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Max reflectivity" help={HELP.dbz} value={c.maxDbz} unit="dBZ" d={1} series={h.map((x) => x.maxDbz)} color="#fb923c" />
          <Metric label="Echo top" help={HELP.echoTop} value={c.echoTopKm} unit="km" d={1} series={h.map((x) => x.echoTopKm)} color="#a78bfa" />
          <Metric label="VIL" help={HELP.vil} value={c.vil} unit="kg/m²" d={1} series={h.map((x) => x.vil)} color="#60a5fa" />
          <Metric label="Flash rate" help={HELP.flashRate} value={c.flashRate} unit="fl/min" d={1} series={h.map((x) => x.flashRate)} color="#22d3ee" />
          <Metric label="Cloud-top temp" help={HELP.ctt} value={c.cttK - 273.15} unit="°C" d={1} sub={`${c.cttK.toFixed(1)} K`} series={h.map((x) => x.cttK - 273.15)} color="#e879f9" />
          <Metric label="Cloud-top cooling" help={HELP.cooling} value={c.cttCoolingK15} unit="K/15 min" d={1} series={[]} color="#e879f9" />
        </div>
        <div className="grid grid-cols-4 gap-2 rounded-lg bg-white/[0.03] p-2 text-center">
          {(
            [
              ['CAPE', c.env.capeJkg, 'J/kg', HELP.cape],
              ['CIN', c.env.cinJkg, 'J/kg', HELP.cin],
              ['Shear 0-6', c.env.shear06, 'm/s', HELP.shear],
              ['PW', c.env.pwMm, 'mm', HELP.pw],
            ] as const
          ).map(([l, v, u, help]) => (
            <div key={l} title={help}>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">{l}</div>
              <AnimatedNumber value={v} format={l === 'CAPE' || l === 'CIN' ? (x) => n0(x).replace('-', '−') : (x) => x.toFixed(1)} className="font-mono text-sm font-semibold text-white" />
              <div className="text-[9px] text-slate-500">{u}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="panel-title mb-1.5">Multi-task nowcast (next 60 min)</div>
          <div className="space-y-1">
            {(Object.keys(PROB_LABEL) as (keyof MultiTaskProbs)[]).map((k) => (
              <button key={k} onClick={() => setTarget(k)} aria-pressed={target === k} className={`grid w-full grid-cols-[110px_1fr_52px] items-center gap-2 rounded px-1 text-left text-[12px] ${target === k ? 'bg-white/5' : ''}`}>
                <span className="text-slate-300">{PROB_LABEL[k]}</span>
                <div className="h-2 rounded-full bg-white/5">
                  <div className="h-2 rounded-full bg-gradient-to-r from-plasma to-volt" style={{ width: `${c.probs[k] * 100}%`, transition: 'width 400ms ease-out' }} />
                </div>
                <AnimatedNumber value={c.probs[k] * 100} decimals={1} className="text-right font-mono text-slate-100" suffix="%" />
              </button>
            ))}
          </div>
        </div>
        <XaiPanel xai={c.xai} />
        <div>
          <div className="panel-title mb-1.5 flex items-center gap-1.5" title={HELP.eta}>
            <MapPin className="h-3.5 w-3.5" /> ETA — towns & panchayats in path
          </div>
          {eta.length === 0 ? (
            <div className="text-xs text-slate-500">No settlements in the 3 h path.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="py-1 font-medium">Place</th>
                  <th className="text-right font-medium">Dist.</th>
                  <th className="text-right font-medium">ETA</th>
                  <th className="text-right font-medium">IST</th>
                </tr>
              </thead>
              <tbody>
                {eta.map((e) => (
                  <tr key={e.name} className="border-t border-white/[0.04]">
                    <td className="max-w-[170px] truncate py-1 text-slate-200">
                      {e.name} <span className="text-[10px] text-slate-500">{e.kind}</span>
                    </td>
                    <td className="text-right font-mono tnum text-slate-400">{e.dist.toFixed(1)} km</td>
                    <td className={`text-right font-mono tnum ${e.eta <= 30 ? 'text-sev-red' : e.eta <= 60 ? 'text-sev-orange' : 'text-slate-300'}`}>{e.eta === 0 ? 'NOW' : `${e.eta} min`}</td>
                    <td className="text-right font-mono tnum text-slate-400">{fmtIST(simTime + e.eta * 60000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <button className="btn btn-primary w-full" onClick={() => nav('/storm3d')}>
          <Box className="h-4 w-4" /> Open 3D view
        </button>
        <div className="text-center text-[10px] text-slate-500">CTT {degC(c.cttK)} · cooling {c.cttCoolingK15.toFixed(1)} K/15 min</div>
      </div>
    </motion.aside>
  );
}

function Metric({ label, value, unit, d, series, color, help, sub }: { label: string; value: number; unit: string; d: number; series: number[]; color: string; help: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2" title={help}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="flex items-end justify-between">
        <div>
          <AnimatedNumber value={value} decimals={d} format={(x) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`} className="font-mono text-lg font-semibold text-white" />
          <span className="ml-1 text-[10px] text-slate-400">{unit}</span>
          {sub && <div className="font-mono text-[10px] text-slate-500">{sub}</div>}
        </div>
        <Sparkline values={series.slice(-30)} color={color} width={70} height={24} />
      </div>
    </div>
  );
}
