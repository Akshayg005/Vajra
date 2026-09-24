export function Sparkline({
  values,
  color = '#22d3ee',
  height = 28,
  width = 120,
  fill = true,
  marker,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
  marker?: number;
}) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const id = `g${color.replace('#', '')}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.4} fill={color} />
      {marker !== undefined && (
        <line
          x1={0}
          x2={width}
          y1={height - 2 - ((marker - min) / span) * (height - 4)}
          y2={height - 2 - ((marker - min) / span) * (height - 4)}
          stroke="#64748b"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}
