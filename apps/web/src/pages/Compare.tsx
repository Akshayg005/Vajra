import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Columns2 } from 'lucide-react';
import type { GridField } from '@vajra/contracts';
import { useStore } from '../store';
import { DBZ, PROB, gridToImage, type Lut } from '../lib/colormap';
import { drawGeo, useGeo } from '../lib/geoCanvas';
import { SeverityBadge } from '../components/SeverityBadge';
import { SEV_RANK } from '../lib/format';

/** Coarse-to-fine: swipe between a 12 km NWP forecast and the 2 km VAJRA nowcast. */
export default function Compare() {
  const snap = useStore((s) => s.snap)!;
  const nowcast = useStore((s) => s.nowcast);
  const [split, setSplit] = useState(0.5);
  const [mode, setMode] = useState<'now' | 'p60'>('now');
  const left = useRef<HTMLCanvasElement>(null);
  const right = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const states = useGeo('/geo/india-states.geojson');
  const districts = useGeo('/geo/india-districts.geojson');
  const [w, s, e, n] = snap.scenario.bbox;
  const W = 1200;
  const H = Math.round((W * (n - s)) / (e - w) / Math.cos((((s + n) / 2) * Math.PI) / 180));

  // basemap (districts fill + lines) is drawn once per domain and reused for every radar frame
  const base = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#03050a';
    ctx.fillRect(0, 0, W, H);
    if (districts) drawGeo(ctx, districts, [w, s, e, n], W, H, { stroke: '#1a2438', width: 0.6, fill: '#0c1528' });
    return c;
  }, [districts, w, s, e, n, W, H]);
  const top = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    if (states) drawGeo(c.getContext('2d')!, states, [w, s, e, n], W, H, { stroke: '#64748b', width: 1.3 });
    return c;
  }, [states, w, s, e, n, W, H]);

  const nwp = snap.nwp;
  const dbz = snap.dbz;
  useEffect(() => {
    const bbox: [number, number, number, number] = [w, s, e, n];
    paint(left.current, nwp, DBZ, false, base, top, bbox, W, H);
    const p60 = nowcast.find((f) => f.band === '30-60');
    if (mode === 'p60' && p60) paint(right.current, p60.prob, PROB, true, base, top, bbox, W, H);
    else paint(right.current, dbz, DBZ, true, base, top, bbox, W, H);
  }, [nwp, dbz, mode, nowcast, base, top, w, s, e, n, W, H]);

  const onMove = (x: number) => {
    const r = wrap.current!.getBoundingClientRect();
    setSplit(Math.min(1, Math.max(0, (x - r.left) / r.width)));
  };
  const live = snap.alerts.filter((a) => a.status !== 'expired').sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);

  return (
    <div className="grid h-full grid-cols-[1fr_380px] gap-3 overflow-hidden p-3">
      <div className="panel flex min-h-0 flex-col p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="panel-title flex items-center gap-1.5">
            <Columns2 className="h-3.5 w-3.5" /> Coarse-to-fine · drag the divider
          </span>
          <div className="flex gap-1">
            <button onClick={() => setMode('now')} className={`rounded-md px-2 py-0.5 text-xs ${mode === 'now' ? 'bg-volt/20 text-volt' : 'text-slate-400'}`}>
              VAJRA mosaic now
            </button>
            <button onClick={() => setMode('p60')} className={`rounded-md px-2 py-0.5 text-xs ${mode === 'p60' ? 'bg-volt/20 text-volt' : 'text-slate-400'}`}>
              VAJRA P(TS) 30-60 min
            </button>
          </div>
        </div>
        <div
          ref={wrap}
          className="relative min-h-0 flex-1 cursor-ew-resize select-none overflow-hidden rounded-lg"
          onMouseMove={(ev) => ev.buttons === 1 && onMove(ev.clientX)}
          onMouseDown={(ev) => onMove(ev.clientX)}
          onTouchMove={(ev) => onMove(ev.touches[0].clientX)}
        >
          <canvas ref={right} width={W} height={H} className="absolute inset-0 h-full w-full object-contain" />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}>
            <canvas ref={left} width={W} height={H} className="absolute inset-0 h-full w-full object-contain" />
          </div>
          <div className="absolute inset-y-0 w-0.5 bg-white shadow-glow" style={{ left: `${split * 100}%` }}>
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink-900 p-1">
              <Columns2 className="h-4 w-4 text-white" />
            </div>
          </div>
          <div className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">NWP (NCUM-like) · 12 km · hourly · position & timing error</div>
          <div className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">VAJRA · 2 km · every 5 min · radar + satellite + lightning</div>
        </div>
      </div>
      <div className="panel scroll-thin min-h-0 overflow-y-auto p-3">
        <div className="panel-title mb-2">Warnings: state → district → block → panchayat</div>
        {live.map((a) => {
          const st = a.areas.find((x) => x.level === 'state');
          const ds = a.areas.filter((x) => x.level === 'district');
          const bl = a.areas.filter((x) => x.level === 'block');
          const gp = a.areas.filter((x) => x.level === 'panchayat');
          return (
            <div key={a.id} className="mb-2 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[12px]">
              <div className="mb-1 flex items-center justify-between">
                <SeverityBadge severity={a.severity} compact />
                <span className="font-mono text-[10px] text-slate-500">{a.id}</span>
              </div>
              <div className="text-slate-300">{st?.name}</div>
              <div className="ml-2 flex items-center gap-1 text-slate-300">
                <ChevronRight className="h-3 w-3" />
                {ds.map((x) => x.name).join(', ')}
              </div>
              <div className="ml-4 flex items-center gap-1 text-slate-300">
                <ChevronRight className="h-3 w-3" />
                {bl.map((x) => x.name).join(', ')}
              </div>
              <div className="ml-6 flex items-center gap-1 text-white">
                <ChevronRight className="h-3 w-3" />
                {gp.map((x) => x.name).join(', ')}
              </div>
            </div>
          );
        })}
        {!live.length && <div className="text-xs text-slate-500">No live warnings.</div>}
        <p className="mt-3 text-[11px] leading-snug text-slate-500">
          NWP puts storms in roughly the right region but tens of km off and smoothed; the nowcast pins the cell to a 2 km grid, so warnings can drop from district level to block
          and panchayat level.
        </p>
      </div>
    </div>
  );
}

function paint(
  c: HTMLCanvasElement | null,
  g: GridField,
  lut: Lut,
  smooth: boolean,
  base: HTMLCanvasElement,
  top: HTMLCanvasElement,
  bbox: [number, number, number, number],
  W: number,
  H: number,
) {
  if (!c) return;
  const [w, s, e, n] = bbox;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(base, 0, 0);
  const tmp = document.createElement('canvas');
  tmp.width = g.width;
  tmp.height = g.height;
  tmp.getContext('2d')!.putImageData(gridToImage(g, lut), 0, 0);
  ctx.imageSmoothingEnabled = smooth;
  const gx = ((g.bbox[0] - w) / (e - w)) * W;
  const gy = ((n - g.bbox[3]) / (n - s)) * H;
  const gw = ((g.bbox[2] - g.bbox[0]) / (e - w)) * W;
  const gh = ((g.bbox[3] - g.bbox[1]) / (n - s)) * H;
  ctx.drawImage(tmp, gx, gy, gw, gh);
  ctx.drawImage(top, 0, 0);
}
