import type { SensorStatus } from '@vajra/contracts';

const SOURCES: { kind: SensorStatus['kind']; label: string }[] = [
  { kind: 'dwr', label: 'Doppler radars' },
  { kind: 'satellite', label: 'INSAT-3DR/3DS' },
  { kind: 'lightning', label: 'Lightning network' },
  { kind: 'nwp', label: 'NWP (NCUM/WRF)' },
  { kind: 'aws', label: 'AWS network' },
];

/** Sources -> quality control -> fusion -> nowcast; excluded feeds are cut (red dashed) so auto-exclusion is visible. */
export function FusionDiagram({ sensors }: { sensors: SensorStatus[] }) {
  const W = 560;
  const H = 230;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Data-fusion diagram">
      {SOURCES.map((s, i) => {
        const list = sensors.filter((x) => x.kind === s.kind);
        const excluded = list.filter((x) => x.state === 'excluded' || x.anomaly === 'dropout').length;
        const degraded = list.filter((x) => x.state === 'degraded' || x.state === 'recovering').length;
        const y = 18 + i * 42;
        const cut = excluded > 0;
        return (
          <g key={s.kind}>
            <rect x={6} y={y} width={170} height={32} rx={7} fill="#0f172a" stroke={cut ? '#ef4444' : degraded ? '#facc15' : '#22d3ee'} strokeOpacity={0.7} />
            <text x={16} y={y + 14} fill="#e2e8f0" fontSize="11.5" fontFamily="Inter">
              {s.label}
            </text>
            <text x={16} y={y + 27} fill={cut ? '#fca5a5' : '#94a3b8'} fontSize="10" fontFamily="JetBrains Mono">
              {list.length - excluded}/{list.length} in fusion{excluded ? ` · ${excluded} excluded` : ''}
            </text>
            <path
              d={`M176 ${y + 16} C 230 ${y + 16}, 230 115, 280 115`}
              fill="none"
              stroke={cut ? '#ef4444' : '#22d3ee'}
              strokeWidth={cut ? 1.2 : 1.8}
              strokeDasharray={cut ? '4 4' : undefined}
              opacity={0.8}
            />
            {cut && (
              <text x={214} y={y + 12} fill="#ef4444" fontSize="12" fontWeight="700">
                ✕
              </text>
            )}
          </g>
        );
      })}
      <rect x={280} y={92} width={120} height={46} rx={9} fill="#1e1b4b" stroke="#a78bfa" />
      <text x={340} y={112} textAnchor="middle" fill="#ede9fe" fontSize="12" fontWeight="600" fontFamily="Inter">
        QC + trust-weighted
      </text>
      <text x={340} y={127} textAnchor="middle" fill="#c4b5fd" fontSize="11" fontFamily="Inter">
        data fusion
      </text>
      <path d="M400 115 L 440 115" stroke="#a78bfa" strokeWidth={2} markerEnd="url(#arr)" />
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#a78bfa" />
        </marker>
      </defs>
      <rect x={446} y={92} width={108} height={46} rx={9} fill="#083344" stroke="#22d3ee" />
      <text x={500} y={112} textAnchor="middle" fill="#cffafe" fontSize="12" fontWeight="600" fontFamily="Inter">
        VAJRA nowcast
      </text>
      <text x={500} y={127} textAnchor="middle" fill="#67e8f9" fontSize="11" fontFamily="Inter">
        0-3 h, 4 km
      </text>
    </svg>
  );
}
