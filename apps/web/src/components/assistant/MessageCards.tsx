import type { WorldSnapshot } from '@vajra/contracts';
import { AXIS, EChart } from '../EChart';
import { SEV_HEX, distanceKm } from '../../lib/format';

export function ChartCard({ name, points }: { name: string; points: [number, number][] }) {
  return (
    <div className="rounded-lg bg-ink-950/60 p-2">
      <div className="text-[11px] text-slate-400">{name} vs lead time (min)</div>
      <EChart
        height={150}
        option={{
          grid: { left: 34, right: 8, top: 10, bottom: 22 },
          tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v}%` },
          xAxis: { type: 'value', min: 15, max: 180, ...AXIS },
          yAxis: { type: 'value', min: 0, max: 100, ...AXIS },
          series: [
            { type: 'line', smooth: true, data: points, areaStyle: { color: 'rgba(34,211,238,0.15)' }, lineStyle: { color: '#22d3ee', width: 2 }, itemStyle: { color: '#22d3ee' } },
          ],
        }}
      />
    </div>
  );
}

export function MiniMap({ snap, place, cellId }: { snap: WorldSnapshot; place: { name: string; lng: number; lat: number }; cellId: string | null }) {
  const [w, s, e, n] = snap.scenario.bbox;
  const W = 260;
  const H = 150;
  const x = (lng: number) => ((lng - w) / (e - w)) * W;
  const y = (lat: number) => ((n - lat) / (n - s)) * H;
  const c = snap.cells.find((q) => q.id === cellId);
  return (
    <div className="rounded-lg bg-ink-950/60 p-2">
      <div className="text-[11px] text-slate-400">
        {place.name}
        {c ? ` · ${c.id} ${distanceKm(c.lng, c.lat, place.lng, place.lat).toFixed(1)} km away` : ''}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mt-1 rounded bg-[#0d1729]" role="img" aria-label={`Mini map around ${place.name}`}>
        {snap.strikes.slice(-300).map((st) => (
          <circle key={st.id} cx={x(st.lng)} cy={y(st.lat)} r={0.9} fill={st.kind === 'CG' ? '#bafaff' : '#a78bfa'} opacity={0.6} />
        ))}
        {snap.cells.map((q) => (
          <g key={q.id}>
            <circle cx={x(q.lng)} cy={y(q.lat)} r={Math.max(3, q.radiusKm / 3)} fill="none" stroke={SEV_HEX[q.severity]} strokeWidth={q.id === cellId ? 2 : 1} />
            {q.forecastTrack.length > 4 && (
              <line x1={x(q.lng)} y1={y(q.lat)} x2={x(q.forecastTrack[4].lng)} y2={y(q.forecastTrack[4].lat)} stroke="#a78bfa" strokeWidth={1} strokeDasharray="2 2" />
            )}
          </g>
        ))}
        <circle cx={x(place.lng)} cy={y(place.lat)} r={4} fill="#22d3ee" stroke="#fff" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
