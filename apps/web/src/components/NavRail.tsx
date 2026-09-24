import { NavLink } from 'react-router-dom';
import { BarChart3, Bell, Box, Columns2, Gauge, LayoutDashboard, MessageSquareText, Smartphone, Users, Cpu } from 'lucide-react';
import { useStore } from '../store';

const ITEMS = [
  { to: '/', label: 'Command', Icon: LayoutDashboard },
  { to: '/alerts', label: 'Alerts', Icon: Bell },
  { to: '/storm3d', label: '3D Storm', Icon: Box },
  { to: '/compare', label: 'NWP vs VAJRA', Icon: Columns2 },
  { to: '/verification', label: 'Verification', Icon: Gauge },
  { to: '/sensors', label: 'Sensors', Icon: Cpu },
  { to: '/reports', label: 'Reports', Icon: Users },
  { to: '/assistant', label: 'Assistant', Icon: MessageSquareText },
  { to: '/analytics', label: 'Analytics', Icon: BarChart3 },
];

export function NavRail() {
  const alerts = useStore((s) => s.snap?.alerts.filter((a) => a.status !== 'expired' && a.status !== 'merged').length ?? 0);
  const bad = useStore((s) => s.snap?.sensors.filter((x) => x.state === 'excluded').length ?? 0);
  return (
    <nav className="z-10 flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] bg-ink-900/80 py-3">
      {ITEMS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `group relative flex w-[64px] flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition ${isActive ? 'bg-volt/10 text-volt' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`
          }
        >
          <Icon className="h-5 w-5" />
          <span className="text-center leading-tight">{label}</span>
          {to === '/alerts' && alerts > 0 && <span className="absolute right-2 top-1 rounded-full bg-sev-red px-1.5 text-[9px] font-bold text-white tnum">{alerts}</span>}
          {to === '/sensors' && bad > 0 && <span className="absolute right-2 top-1 rounded-full bg-sev-orange px-1.5 text-[9px] font-bold text-ink-950 tnum">{bad}</span>}
        </NavLink>
      ))}
      <div className="mt-auto" />
      <a href="#/citizen" target="_blank" rel="noreferrer" className="flex w-[64px] flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium text-plasma hover:bg-plasma/10">
        <Smartphone className="h-5 w-5" />
        Citizen app
      </a>
    </nav>
  );
}
