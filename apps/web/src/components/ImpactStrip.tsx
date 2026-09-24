import { Anchor, Factory, GraduationCap, Plane, Route, Tractor, Users } from 'lucide-react';
import { useStore } from '../store';
import { AnimatedNumber } from './AnimatedNumber';
import { fmtN } from '../lib/format';

/** Aggregated impact of all live warnings — "what the storm will do". */
export function ImpactStrip() {
  const alerts = useStore((s) => s.snap?.alerts ?? []);
  const live = alerts.filter((a) => a.status === 'active' || a.status === 'updated');
  const sum = (f: (a: (typeof live)[number]) => number) => live.reduce((acc, a) => acc + f(a), 0);
  const airports = new Set(live.flatMap((a) => a.impact.airports));
  const items = [
    { Icon: Users, label: 'People exposed', v: sum((a) => a.impact.population), fmt: true },
    { Icon: Tractor, label: 'Farmers in fields', v: sum((a) => a.impact.farmersInField), fmt: true },
    { Icon: GraduationCap, label: 'Schools in session', v: sum((a) => a.impact.schoolsInSession) },
    { Icon: Plane, label: 'Airports', v: airports.size },
    { Icon: Route, label: 'Highway km', v: sum((a) => a.impact.highwaysKm) },
    { Icon: Factory, label: 'Substations', v: sum((a) => a.impact.substations) },
    { Icon: Anchor, label: 'Fishing boats', v: sum((a) => a.impact.fishingBoats) },
  ];
  return (
    <div className="panel pointer-events-auto mx-auto flex w-fit items-center gap-5 px-4 py-2">
      <span className="panel-title">Impact · {live.length} live warnings</span>
      {items.map(({ Icon, label, v, fmt }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-400" />
          <div className="leading-tight">
            <AnimatedNumber value={v} format={fmt ? (x) => fmtN(Math.round(x)) : undefined} className="font-mono text-sm font-semibold text-white" />
            <div className="text-[10px] text-slate-500">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
