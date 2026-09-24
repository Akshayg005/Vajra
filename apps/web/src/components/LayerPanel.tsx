import { Layers, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useStore, type BandKey, type LayerKey } from '../store';
import { CONF, CTT, DBZ, PROB, lutCss } from '../lib/colormap';
import { HELP } from '../lib/help';

const LAYERS: { k: LayerKey; label: string; hint: string }[] = [
  { k: 'radar', label: 'Radar mosaic (dBZ)', hint: 'DWR composite, 2 km grid' },
  { k: 'satellite', label: 'Satellite IR cloud tops', hint: 'INSAT-3DR/3DS TIR1, 4 km' },
  { k: 'lightning', label: 'Lightning', hint: 'CG ± and IC, fade over 20 min' },
  { k: 'nowcast', label: 'Nowcast bands 0-3 h', hint: 'P(thunderstorm) by lead time, 4 km' },
  { k: 'extended', label: '3-6 h outlook (low conf.)', hint: 'hatched' },
  { k: 'cells', label: 'Storm cells', hint: 'ID, max dBZ, IMD colour' },
  { k: 'tracks', label: 'Tracks & 60-min cones', hint: 'past track + forecast cone' },
  { k: 'alerts', label: 'Warning polygons', hint: 'solid = issued, faint = draft' },
  { k: 'confidence', label: 'Confidence / bust map', hint: HELP.confidence },
  { k: 'rings', label: 'DWR range rings', hint: '250 km, red = feed down' },
  { k: 'reports', label: 'Citizen reports', hint: 'green verified · yellow unverified · grey fake/duplicate' },
  { k: 'cities', label: 'Cities', hint: 'labels scale with zoom' },
  { k: 'assets', label: 'Impact assets', hint: 'airports, substations, ports, highways' },
  { k: 'districts', label: 'District boundaries', hint: 'Survey of India–compliant' },
  { k: 'imagery', label: 'Satellite basemap (online)', hint: 'optional, needs internet' },
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
  const opacity = useStore((s) => s.opacity);
  const toggle = useStore((s) => s.toggleLayer);
  const setOpacity = useStore((s) => s.setOpacity);
  const band = useStore((s) => s.band);
  const setBand = useStore((s) => s.setBand);
  const [open, setOpen] = useState(true);
  const [tune, setTune] = useState<LayerKey | null>(null);
  return (
    <div className="panel pointer-events-auto w-[260px] p-3">
      <button className="flex w-full items-center justify-between" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="panel-title flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> Layers
        </span>
        <span className="text-xs text-slate-400">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-0.5">
          {LAYERS.map((l) => (
            <div key={l.k}>
              <div className="flex items-center gap-2 rounded-md px-1.5 py-[3px] hover:bg-white/5">
                <input id={`layer-${l.k}`} type="checkbox" className="accent-cyan-400" checked={layers[l.k]} onChange={() => toggle(l.k)} />
                <label htmlFor={`layer-${l.k}`} title={l.hint} className="flex-1 cursor-pointer truncate text-[12.5px] text-slate-200">
                  {l.label}
                </label>
                <button
                  className={`rounded p-0.5 ${tune === l.k ? 'text-volt' : 'text-slate-500 hover:text-slate-200'}`}
                  onClick={() => setTune(tune === l.k ? null : l.k)}
                  aria-label={`Opacity for ${l.label}`}
                  title="Opacity"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
              {tune === l.k && (
                <div className="flex items-center gap-2 px-2 pb-1">
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={opacity[l.k]}
                    onChange={(e) => setOpacity(l.k, Number(e.target.value))}
                    className="flex-1 accent-cyan-400"
                    aria-label={`${l.label} opacity`}
                  />
                  <span className="w-9 text-right font-mono text-[11px] text-slate-300">{Math.round(opacity[l.k] * 100)}%</span>
                </div>
              )}
            </div>
          ))}
          <div className="pt-2">
            <div className="panel-title mb-1.5">Lead-time band (min)</div>
            <div className="flex gap-1">
              {BANDS.map((b) => (
                <button
                  key={b.k}
                  onClick={() => setBand(b.k)}
                  aria-pressed={band === b.k}
                  className={`flex-1 rounded-md border px-1 py-1 font-mono text-[10px] ${band === b.k ? 'border-volt/60 bg-volt/15 text-white' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
                >
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
    <div className="panel pointer-events-auto w-[260px] space-y-2 p-3 text-[11px] text-slate-400">
      {layers.radar && <Scale title="Reflectivity" css={lutCss(DBZ)} ticks={['0', '20', '35', '50', '65 dBZ']} help={HELP.dbz} />}
      {layers.satellite && <Scale title="Cloud-top temperature" css={lutCss(CTT)} ticks={['−83', '−53', '−23', '+7', '+32 °C']} help={HELP.ctt} />}
      {layers.nowcast && band !== 'all' && <Scale title={`P(thunderstorm) ${band} min`} css={lutCss(PROB)} ticks={['0', '25', '50', '75', '97%']} help={HELP.probability} />}
      {layers.confidence && <Scale title="Nowcast confidence" css={lutCss(CONF)} ticks={['low', '', '', '', 'high']} help={HELP.confidence} />}
      {layers.nowcast && band === 'all' && (
        <div>
          <div className="mb-1 text-slate-300">Nowcast bands · P ≥ 25%</div>
          <div className="flex items-center gap-2">
            {[
              ['#e879f9', '0-30'],
              ['#a78bfa', '30-60'],
              ['#60a5fa', '60-120'],
              ['#22d3ee', '120-180'],
            ].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
                <span className="font-mono">{l}</span>
              </span>
            ))}
          </div>
          {layers.extended && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="hatch h-2.5 w-6 rounded-sm" /> 3-6 h outlook, low confidence
            </div>
          )}
        </div>
      )}
      {layers.lightning && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#bafaff]" /> −CG
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#f472b6]" /> +CG
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-plasma/70" /> IC
          </span>
          <span className="text-slate-500">fade: 20 min</span>
        </div>
      )}
      {layers.assets && <div className="text-slate-400">✈ airport · ϟ substation · ⚓ port · ═ highway</div>}
      <div className="text-[10px] leading-tight text-slate-500">Boundaries: Survey of India outline via DataMeet (CC BY 4.0){layers.imagery ? ' · Imagery © Esri' : ''}</div>
    </div>
  );
}

function Scale({ title, css, ticks, help }: { title: string; css: string; ticks: string[]; help: string }) {
  return (
    <div title={help}>
      <div className="mb-1 text-slate-300">{title}</div>
      <div className="h-2 rounded-sm" style={{ background: css }} />
      <div className="mt-0.5 flex justify-between font-mono text-[10px] text-slate-500">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}
