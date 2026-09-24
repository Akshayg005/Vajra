import { Layers } from 'lucide-react';
import { useState } from 'react';
import { useStore, type BandKey, type LayerKey } from '../store';
import { CTT, DBZ, PROB, lutCss } from '../lib/colormap';

const LAYERS: { k: LayerKey; label: string; hint: string }[] = [
  { k: 'radar', label: 'Radar mosaic (dBZ)', hint: 'DWR composite, 2 km' },
  { k: 'satellite', label: 'Satellite IR (CTT)', hint: 'INSAT-3DR/3DS TIR, 4 km' },
  { k: 'lightning', label: 'Lightning', hint: 'CG ± / IC, last 20 min' },
  { k: 'nowcast', label: 'Nowcast bands', hint: '0-3 h, 4 km' },
  { k: 'extended', label: '3-6 h extended (low conf.)', hint: 'hatched' },
  { k: 'cells', label: 'Storm cells', hint: 'ID, severity' },
  { k: 'tracks', label: 'Tracks & cones', hint: 'past + 60 min cone' },
  { k: 'alerts', label: 'Warning polygons', hint: 'IMD colour code' },
  { k: 'confidence', label: 'Confidence / bust map', hint: 'coverage, CI, model-obs' },
  { k: 'rings', label: 'DWR range rings', hint: '250 km' },
  { k: 'reports', label: 'Citizen reports', hint: 'verified / fake' },
  { k: 'districts', label: 'District boundaries', hint: 'SoI-compliant' },
  { k: 'imagery', label: 'Satellite basemap (online)', hint: 'optional' },
];

const BANDS: { k: BandKey; label: string; color?: string }[] = [
  { k: 'all', label: 'All' },
  { k: '0-30', label: '0-30', color: '#e879f9' },
  { k: '30-60', label: '30-60', color: '#a78bfa' },
  { k: '60-120', label: '60-120', color: '#60a5fa' },
  { k: '120-180', label: '120-180', color: '#22d3ee' },
];

export function LayerPanel() {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const band = useStore((s) => s.band);
  const setBand = useStore((s) => s.setBand);
  const [open, setOpen] = useState(true);
  return (
    <div className="panel pointer-events-auto w-[248px] p-3">
      <button className="flex w-full items-center justify-between" onClick={() => setOpen(!open)}>
        <span className="panel-title flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> Layers
        </span>
        <span className="text-xs text-slate-500">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-0.5">
          {LAYERS.map((l) => (
            <label key={l.k} title={l.hint} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-[3px] hover:bg-white/5">
              <input type="checkbox" className="accent-cyan-400" checked={layers[l.k]} onChange={() => toggle(l.k)} />
              <span className="flex-1 truncate text-[12.5px] text-slate-200">{l.label}</span>
            </label>
          ))}
          <div className="pt-2">
            <div className="panel-title mb-1.5">Lead-time band (min)</div>
            <div className="flex gap-1">
              {BANDS.map((b) => (
                <button key={b.k} onClick={() => setBand(b.k)} className={`flex-1 rounded-md border px-1 py-1 font-mono text-[10px] ${band === b.k ? 'border-volt/60 bg-volt/15 text-white' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>
                  {b.color && <span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: b.color }} />}
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Legend() {
  const layers = useStore((s) => s.layers);
  const band = useStore((s) => s.band);
  return (
    <div className="panel pointer-events-auto w-[248px] space-y-2 p-3 text-[11px] text-slate-400">
      {layers.radar && <Scale title="Reflectivity" css={lutCss(DBZ)} ticks={['0', '20', '35', '50', '65 dBZ']} />}
      {layers.satellite && <Scale title="Cloud-top temperature" css={lutCss(CTT)} ticks={['190', '220', '250', '280', '305 K']} />}
      {layers.nowcast && band !== 'all' && <Scale title={`P(thunderstorm) ${band} min`} css={lutCss(PROB)} ticks={['0', '25', '50', '75', '100%']} />}
      {layers.nowcast && band === 'all' && (
        <div>
          <div className="mb-1 text-slate-300">Nowcast bands · P ≥ 25%</div>
          <div className="flex items-center gap-2">
            {[['#e879f9', '0-30'], ['#a78bfa', '30-60'], ['#60a5fa', '60-120'], ['#22d3ee', '120-180']].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
                <span className="font-mono">{l}</span>
              </span>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="hatch h-2.5 w-6 rounded-sm" /> 3-6 h extended, low confidence
          </div>
        </div>
      )}
      <div className="text-[9.5px] leading-tight text-slate-500">Boundaries: Survey of India outline via DataMeet (CC BY 4.0){layers.imagery ? ' · Imagery © Esri' : ''}</div>
      {layers.lightning && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#bafaff]" /> −CG</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#f472b6]" /> +CG</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-plasma/70" /> IC</span>
          <span className="text-slate-500">fade: 20 min</span>
        </div>
      )}
    </div>
  );
}

function Scale({ title, css, ticks }: { title: string; css: string; ticks: string[] }) {
  return (
    <div>
      <div className="mb-1 text-slate-300">{title}</div>
      <div className="h-2 rounded-sm" style={{ background: css }} />
      <div className="mt-0.5 flex justify-between font-mono text-[10px] text-slate-500">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
