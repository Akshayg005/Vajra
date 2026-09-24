import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Anchor, Bell, Cpu, Factory, MapPin, Plane, Route, Users, X, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useStore } from '../store';
import { INFRA, TOWNS } from '../engine/places';
import { distanceKm } from '../engine/geo';
import { fmtIST, fmtN } from '../lib/format';
import { HELP, n0 } from '../lib/help';
import { ago, useSimNow } from '../lib/useNow';
import { SeverityBadge } from './SeverityBadge';
import { Sparkline } from './Sparkline';
import { CellInspector } from './CellInspector';

/** "Click anything": one drawer that explains whatever was picked on the map. */
export function DetailDrawer() {
  const detail = useStore((s) => s.detail);
  if (!detail) return null;
  if (detail.kind === 'cell') return <CellInspector />;
  return <Other />;
}

function Shell({ title, icon, children }: { title: ReactNode; icon: ReactNode; children: ReactNode }) {
  const close = useStore((s) => s.openDetail);
  return (
    <motion.aside initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="panel pointer-events-auto w-[400px] overflow-hidden" role="dialog" aria-label="Details">
      <div className="flex items-center justify-between border-b border-white/5 p-3">
        <div className="flex items-center gap-2 text-white">
          {icon}
          <span className="font-semibold">{title}</span>
        </div>
        <button className="btn h-7 w-7 p-0" onClick={() => close(null)} aria-label="Close details (Esc)">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2 p-3 text-sm">{children}</div>
    </motion.aside>
  );
}

const KV = ({ k, v, help }: { k: string; v: ReactNode; help?: string }) => (
  <div className="kv" title={help}>
    <span>{k}</span>
    <span>{v}</span>
  </div>
);

function Other() {
  const detail = useStore((s) => s.detail)!;
  const snap = useStore((s) => s.snap)!;
  const nav = useNavigate();
  const now = useSimNow();

  if (detail.kind === 'alert') {
    const a = snap.alerts.find((x) => x.id === detail.id);
    if (!a) return <Gone />;
    return (
      <Shell title={a.id} icon={<Bell className="h-4 w-4 text-sev-orange" />}>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={a.severity} withAction />
          <span className="chip font-mono uppercase">{a.status}</span>
        </div>
        <div className="text-slate-100">{a.headline}</div>
        <KV k="Probability" v={`${(a.probability * 100).toFixed(1)}%`} help={HELP.probability} />
        <KV k="ETA to nearest town" v={a.etaMin > 0 ? `${a.etaMin} min` : 'now'} help={HELP.eta} />
        <KV k="Population exposed" v={n0(a.impact.population)} help={HELP.impact} />
        <KV k="Farmers in fields" v={n0(a.impact.farmersInField)} />
        <KV k="Updated" v={ago(a.updatedAt, now)} />
        <button className="btn btn-primary w-full" onClick={() => nav(`/alerts?id=${encodeURIComponent(a.id)}`)}>
          Open in Alert Center
        </button>
      </Shell>
    );
  }
  if (detail.kind === 'strike') {
    const s = snap.strikes.find((x) => String(x.id) === detail.id);
    if (!s) return <Gone text="This strike has aged out of the 20-minute window." />;
    return (
      <Shell title={`Strike #${s.id}`} icon={<Zap className="h-4 w-4 text-volt" />}>
        <KV k="Type" v={s.kind === 'CG' ? 'Cloud-to-ground' : 'In-cloud'} />
        <KV k="Polarity" v={s.polarity > 0 ? 'Positive (+CG)' : 'Negative (−)'} />
        <KV k="Peak current" v={`${s.peakKa.toFixed(1)} kA`} />
        <KV k="Time" v={`${fmtIST(s.t, true)} IST · ${ago(s.t, now)}`} />
        <KV k="Location" v={`${s.lat.toFixed(3)}°N ${s.lng.toFixed(3)}°E`} />
        <KV k="Parent storm" v={s.cellId ?? '—'} />
      </Shell>
    );
  }
  if (detail.kind === 'report') {
    const r = snap.reports.find((x) => x.id === detail.id);
    if (!r) return <Gone />;
    return (
      <Shell title={r.id} icon={<Users className="h-4 w-4 text-sev-green" />}>
        <div className="text-slate-100">
          <span className="capitalize text-volt">{r.event}</span> — “{r.text}”
        </div>
        <KV k="Status" v={r.status.toUpperCase()} />
        <KV k="Match score" v={`${Math.round(r.matchScore * 100)}%`} />
        <div className="text-xs text-slate-400">{r.matchReason}</div>
        <KV k="Place" v={r.place} />
        <KV k="Reported" v={ago(r.t, now)} />
      </Shell>
    );
  }
  if (detail.kind === 'sensor') {
    const s = snap.sensors.find((x) => x.id === detail.id);
    if (!s) return <Gone />;
    return (
      <Shell title={s.name} icon={<Cpu className="h-4 w-4 text-volt" />}>
        <KV k="State" v={s.state.toUpperCase()} />
        <KV k="Anomaly" v={s.anomaly ?? 'none'} />
        <KV k="Latency" v={s.latencySec < 120 ? `${s.latencySec.toFixed(1)} s` : `${(s.latencySec / 60).toFixed(1)} min`} help={HELP.latency} />
        <KV k="Uptime" v={`${s.uptimePct.toFixed(2)}%`} />
        <KV k="Trust" v={`${(s.trust * 100).toFixed(1)}%`} help={HELP.trust} />
        <Sparkline values={s.series.slice(-30)} width={370} height={40} color={s.state === 'ok' ? '#f5a524' : '#fb923c'} />
        <button className="btn w-full" onClick={() => nav('/sensors')}>
          Open Sensor Health
        </button>
      </Shell>
    );
  }
  if (detail.kind === 'asset') {
    const a = INFRA.find((x) => x.name === detail.id);
    if (!a) return <Gone />;
    const Icon = a.kind === 'airport' ? Plane : a.kind === 'port' ? Anchor : a.kind === 'highway' ? Route : Factory;
    const nearest = [...snap.cells].sort((p, q) => distanceKm(p.lng, p.lat, a.lng, a.lat) - distanceKm(q.lng, q.lat, a.lng, a.lat))[0];
    const inWarn = snap.alerts.filter((x) => (x.status === 'active' || x.status === 'updated') && x.impact.airports.includes(a.name));
    return (
      <Shell title={a.name} icon={<Icon className="h-4 w-4 text-sev-yellow" />}>
        <KV k="Asset type" v={a.kind} />
        {a.km && <KV k="Segment length" v={`${a.km} km`} />}
        <KV k="Nearest storm" v={nearest ? `${nearest.id} · ${distanceKm(nearest.lng, nearest.lat, a.lng, a.lat).toFixed(1)} km` : 'none'} />
        <KV k="Inside a live warning" v={inWarn.length ? inWarn.map((x) => x.id).join(', ') : 'no'} />
      </Shell>
    );
  }
  if (detail.kind === 'city') {
    const t = TOWNS.find((x) => x.name === detail.id);
    if (!t) return <Gone />;
    return <CityDetail name={t.name} />;
  }
  return null;
}

function CityDetail({ name }: { name: string }) {
  const snap = useStore((s) => s.snap)!;
  const t = TOWNS.find((x) => x.name === name)!;
  const nearestStrike = snap.strikes.reduce<number | null>((m, s) => {
    const d = distanceKm(s.lng, s.lat, t.lng, t.lat);
    return m === null || d < m ? d : m;
  }, null);
  return (
    <Shell title={t.name} icon={<MapPin className="h-4 w-4 text-volt" />}>
      <KV k="State" v={t.state} />
      <KV k="Population (2011)" v={fmtN(t.pop)} />
      <KV k="Nearest strike (20 min)" v={nearestStrike !== null ? `${nearestStrike.toFixed(1)} km` : 'none'} />
      <a className="btn w-full" href={`#/public?place=${encodeURIComponent(t.name)}`} target="_blank" rel="noreferrer">
        Open citizen view for {t.name}
      </a>
    </Shell>
  );
}

function Gone({ text = 'This item is no longer active.' }: { text?: string }) {
  return (
    <Shell title="Not available" icon={<X className="h-4 w-4" />}>
      <div className="text-slate-400">{text}</div>
    </Shell>
  );
}
