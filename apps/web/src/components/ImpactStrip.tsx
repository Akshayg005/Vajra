import { Anchor, Factory, GraduationCap, Plane, Route, Tractor, Users } from 'lucide-react';
import { useMemo } from 'react';
import { AnimatedNumber } from './AnimatedNumber';
import { fmtN } from '../lib/format';
import { impactTotals, isIssued, useLiveAlerts } from '../selectors';
import { HELP } from '../lib/help';

/** Aggregated impact of all issued warnings — "what the storm will do". Same numbers as the Alert Center. */
export function ImpactStrip() {
  const live = useLiveAlerts();
  const t = useMemo(() => impactTotals(live), [live]);
  const issued = live.filter(isIssued).length;
  const items = [
    { Icon: Users, label: 'People exposed', v: t.population, fmt: true },
    { Icon: Tractor, label: 'Farmers in fields', v: t.farmers, fmt: true },
    { Icon: GraduationCap, label: 'Schools in session', v: t.schools },
    { Icon: Plane, label: 'Airports', v: t.airports },
    { Icon: Route, label: 'Highway km', v: t.highwaysKm },
    { Icon: Factory, label: 'Substations', v: t.substations },
    { Icon: Anchor, label: 'Fishing boats', v: t.boats },
  ];
  return (
    <div className="panel pointer-events-auto mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-2" title={HELP.impact}>
      <span className="panel-title">
        Impact · {issued} issued{live.length > issued ? ` + ${live.length - issued} draft` : ''}
      </span>
      {items.map(({ Icon, label, v, fmt }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-400" />
          <div className="leading-tight">
            <AnimatedNumber value={v} format={fmt ? (x) => fmtN(Math.round(x)) : undefined} className="font-mono text-sm font-semibold text-white" />
            <div className="text-[10px] text-slate-400">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
