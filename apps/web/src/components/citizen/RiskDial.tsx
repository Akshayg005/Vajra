/** Semicircular risk dial (0-100 %), colour + text + needle so it never relies on colour alone. */
export function RiskDial({ p, color, label }: { p: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(1, p));
  const r = 70;
  const cx = 90;
  const cy = 88;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  const ang = Math.PI * (1 - pct);
  return (
    <svg viewBox="0 0 180 104" className="w-full max-w-[240px]" role="img" aria-label={`${label}: ${Math.round(pct * 100)} percent`}>
      <path d={arc(0, 0.25)} stroke="#22c55e" strokeWidth="12" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d={arc(0.26, 0.55)} stroke="#facc15" strokeWidth="12" fill="none" opacity="0.8" />
      <path d={arc(0.56, 0.75)} stroke="#fb923c" strokeWidth="12" fill="none" opacity="0.85" />
      <path d={arc(0.76, 1)} stroke="#ef4444" strokeWidth="12" fill="none" strokeLinecap="round" opacity="0.9" />
      <line x1={cx} y1={cy} x2={cx + (r - 18) * Math.cos(ang)} y2={cy - (r - 18) * Math.sin(ang)} stroke="#fff" strokeWidth="3" strokeLinecap="round" style={{ transition: 'all 600ms ease-out' }} />
      <circle cx={cx} cy={cy} r="6" fill={color} stroke="#fff" strokeWidth="2" />
      <text x={cx} y={cy - 22} textAnchor="middle" className="fill-white font-mono" fontSize="22" fontWeight="700">
        {(pct * 100).toFixed(0)}%
      </text>
    </svg>
  );
}
