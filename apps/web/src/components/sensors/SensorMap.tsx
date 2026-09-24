import { useEffect, useRef } from 'react';
import type { SensorStatus } from '@vajra/contracts';
import { drawGeo, useGeo } from '../../lib/geoCanvas';

/** Network map: India (SoI outline + states), DWR 250 km rings, and every sensor coloured by state. */
export function SensorMap({ sensors, focus }: { sensors: SensorStatus[]; focus: [number, number, number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const outline = useGeo('/geo/india-outline.geojson');
  const states = useGeo('/geo/india-states.geojson');
  const bbox: [number, number, number, number] = [67, 6, 98, 37.5];
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#040913';
    g.fillRect(0, 0, W, H);
    if (outline) drawGeo(g, outline, bbox, W, H, { stroke: '#8394b8', width: 1, fill: '#0d1729' });
    if (states) drawGeo(g, states, bbox, W, H, { stroke: '#2a3953', width: 0.6 });
    const x = (lng: number) => ((lng - bbox[0]) / (bbox[2] - bbox[0])) * W;
    const y = (lat: number) => ((bbox[3] - lat) / (bbox[3] - bbox[1])) * H;
    const kmPx = W / ((bbox[2] - bbox[0]) * 105);
    // focus box = scenario domain
    g.strokeStyle = 'rgba(167,139,250,0.7)';
    g.setLineDash([4, 3]);
    g.strokeRect(x(focus[0]), y(focus[3]), x(focus[2]) - x(focus[0]), y(focus[1]) - y(focus[3]));
    g.setLineDash([]);
    for (const s of sensors) {
      if (s.kind === 'satellite' || s.kind === 'nwp') continue;
      const bad = s.state === 'excluded' || s.anomaly === 'dropout';
      const col = bad ? '#ef4444' : s.state === 'ok' ? '#22d3ee' : '#facc15';
      if (s.kind === 'dwr') {
        g.beginPath();
        g.arc(x(s.lng), y(s.lat), (s.rangeKm ?? 250) * kmPx, 0, Math.PI * 2);
        g.strokeStyle = bad ? 'rgba(239,68,68,0.8)' : 'rgba(34,211,238,0.25)';
        g.lineWidth = bad ? 2 : 1;
        g.stroke();
      }
      g.beginPath();
      g.arc(x(s.lng), y(s.lat), s.kind === 'dwr' ? 3.5 : 2.2, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
    }
  }, [sensors, outline, states, focus]);
  return <canvas ref={ref} width={520} height={560} className="w-full rounded-lg" aria-label="Sensor network map" />;
}
