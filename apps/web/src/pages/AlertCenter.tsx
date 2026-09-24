import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Anchor, Bell, Copy, Download, Factory, FileCode2, GitMerge, GraduationCap, MessageCircle, Plane, Radio, Route, Siren, Smartphone, Tractor, Users, VolumeX } from 'lucide-react';
import type { Alert, Channel } from '@vajra/contracts';
import { useStore } from '../store';
import { SeverityBadge } from '../components/SeverityBadge';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { SEV_RANK, download, fmtIST, fmtN } from '../lib/format';
import { hazardText } from '../engine/alerts';

const CH: Record<Channel, { label: string; Icon: typeof Bell }> = {
  sms: { label: 'SMS (cell broadcast)', Icon: Smartphone },
  whatsapp: { label: 'WhatsApp', Icon: MessageCircle },
  push: { label: 'App push', Icon: Bell },
  siren: { label: 'Sirens', Icon: Siren },
  cap: { label: 'CAP 1.2 feed', Icon: FileCode2 },
};

export default function AlertCenter() {
  const alerts = useStore((s) => s.snap?.alerts ?? []);
  const adapter = useStore((s) => s.adapter);
  const simTime = useStore((s) => s.snap?.stats.simTime ?? 0);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'bulletin' | 'cap'>('bulletin');
  const [cap, setCap] = useState('');
  const [filter, setFilter] = useState<'live' | 'all'>('live');
  const list = useMemo(
    () =>
      [...alerts]
        .filter((a) => (filter === 'live' ? a.status === 'active' || a.status === 'updated' : true))
        .sort((a, b) => (a.status === 'expired' ? 1 : 0) - (b.status === 'expired' ? 1 : 0) || SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.updatedAt - a.updatedAt),
    [alerts, filter],
  );
  const a = list.find((x) => x.id === sel) ?? list[0];
  useEffect(() => {
    if (a && tab === 'cap') adapter?.capXml(a.id).then((x) => setCap(x ?? ''));
  }, [a?.id, a?.updatedAt, tab, adapter]);
  const suppressed = alerts.reduce((s, x) => s + x.suppressed, 0);
  const merged = alerts.reduce((s, x) => s + x.mergedFrom.length, 0);
  const falseAlarms = alerts.filter((x) => x.falseAlarm).length;
  const totals = (['sms', 'whatsapp', 'push', 'siren', 'cap'] as Channel[]).map((ch) => ({
    ch,
    sent: alerts.reduce((s, x) => s + (x.delivery.find((d) => d.channel === ch)?.sent ?? 0), 0),
    delivered: alerts.reduce((s, x) => s + (x.delivery.find((d) => d.channel === ch)?.delivered ?? 0), 0),
    failed: alerts.reduce((s, x) => s + (x.delivery.find((d) => d.channel === ch)?.failed ?? 0), 0),
  }));

  return (
    <div className="grid h-full grid-cols-[420px_1fr] gap-3 overflow-hidden p-3">
      <div className="panel flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-white/5 p-3">
          <span className="panel-title">Warnings</span>
          <div className="flex gap-1">
            {(['live', 'all'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-2 py-0.5 text-xs ${filter === f ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/5'}`}>
                {f === 'live' ? 'Live' : 'All (log)'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 border-b border-white/5 p-3 text-center">
          <Mini label="Repeats suppressed" value={suppressed} Icon={VolumeX} />
          <Mini label="Merged overlaps" value={merged} Icon={GitMerge} />
          <Mini label="Verified false alarms" value={falseAlarms} Icon={Bell} />
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {list.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={`w-full border-b border-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/5 ${a?.id === x.id ? 'bg-white/[0.06]' : ''} ${x.status === 'expired' ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <SeverityBadge severity={x.severity} />
                <span className="font-mono text-[11px] text-slate-500">
                  {x.id} · {x.status === 'expired' ? 'expired' : fmtIST(x.updatedAt)}
                </span>
              </div>
              <div className="mt-1 text-[13px] font-medium text-slate-100">{x.headline}</div>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-400">
                <span>{x.district}, {x.state}</span>
                <span className="font-mono tnum">P {Math.round(x.probability * 100)}%</span>
                {x.etaMin > 0 && <span className="font-mono tnum">ETA {x.etaMin} min</span>}
                {x.falseAlarm && <span className="text-sev-orange">false alarm</span>}
                {x.suppressed > 0 && <span className="text-slate-500">+{x.suppressed} merged</span>}
              </div>
            </button>
          ))}
          {!list.length && <div className="p-6 text-sm text-slate-500">No live warnings. The fatigue guard keeps this list short.</div>}
        </div>
      </div>

      <div className="scroll-thin min-h-0 space-y-3 overflow-y-auto pr-1">
        {/* delivery totals */}
        <div className="panel p-3">
          <div className="panel-title mb-2 flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5" /> Dissemination — live delivery counters (all warnings)
          </div>
          <div className="grid grid-cols-5 gap-2">
            {totals.map((t) => (
              <div key={t.ch} className="rounded-lg bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  {(() => {
                    const I = CH[t.ch].Icon;
                    return <I className="h-3.5 w-3.5" />;
                  })()}
                  {CH[t.ch].label}
                </div>
                <AnimatedNumber value={t.delivered} format={(v) => fmtN(Math.round(v))} className="font-mono text-xl font-semibold text-white" />
                <div className="font-mono text-[10px] text-slate-500 tnum">
                  sent {fmtN(t.sent)} · failed {fmtN(t.failed)}
                </div>
              </div>
            ))}
          </div>
        </div>
        {a ? <AlertDetail a={a} tab={tab} setTab={setTab} cap={cap} simTime={simTime} /> : <div className="panel p-6 text-slate-500">Select a warning.</div>}
      </div>
    </div>
  );
}

function AlertDetail({ a, tab, setTab, cap, simTime }: { a: Alert; tab: 'bulletin' | 'cap'; setTab: (t: 'bulletin' | 'cap') => void; cap: string; simTime: number }) {
  const imp = a.impact;
  return (
    <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <SeverityBadge severity={a.severity} withAction />
              <span className="chip">{hazardText(a.hazard)}</span>
              <span className="chip font-mono">{a.status.toUpperCase()}</span>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">{a.headline}</h2>
            <div className="mt-1 font-mono text-xs text-slate-400">
              {a.id} · issued {fmtIST(a.issuedAt)} · updated {fmtIST(a.updatedAt)} · valid to {fmtIST(a.expiresAt)} IST · storm {a.cellId}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Probability</div>
            <AnimatedNumber value={a.probability * 100} suffix="%" className="font-mono text-3xl font-bold text-white" />
            <div className="font-mono text-xs text-slate-400">ETA {a.etaMin} min · {fmtIST(simTime + a.etaMin * 60000)}</div>
          </div>
        </div>
        <div className="mt-3">
          <div className="panel-title mb-1.5">Warned areas (block → panchayat)</div>
          <div className="flex flex-wrap gap-1.5">
            {a.areas.map((x, i) => (
              <span key={i} className="chip">
                <span className="text-[9px] uppercase text-slate-500">{x.level}</span> {x.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="panel p-3">
        <div className="panel-title mb-2">Impact — what this storm will do</div>
        <div className="grid grid-cols-4 gap-2 xl:grid-cols-8">
          <Imp Icon={Users} label="Population" v={imp.population} big />
          <Imp Icon={Tractor} label="Farmers in field" v={imp.farmersInField} big />
          <Imp Icon={GraduationCap} label="Schools open" v={imp.schoolsInSession} />
          <Imp Icon={Users} label="Students" v={imp.students} big />
          <Imp Icon={Plane} label="Airports" v={imp.airports.length} sub={imp.airports.join(', ')} />
          <Imp Icon={Route} label="Highway km" v={imp.highwaysKm} />
          <Imp Icon={Factory} label="Substations" v={imp.substations} />
          <Imp Icon={Anchor} label="Fishing boats" v={imp.fishingBoats} />
        </div>
      </div>
      <div className="panel p-3">
        <div className="panel-title mb-2">Delivery for this warning</div>
        <div className="space-y-1.5">
          {a.delivery.map((d) => (
            <div key={d.channel} className="grid grid-cols-[150px_1fr_160px] items-center gap-3 text-[12px]">
              <span className="text-slate-300">{CH[d.channel].label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div className="h-2 rounded-full bg-gradient-to-r from-volt to-plasma" style={{ width: `${(d.delivered / Math.max(1, d.target)) * 100}%`, transition: 'width 400ms ease-out' }} />
              </div>
              <span className="text-right font-mono text-slate-300 tnum">
                {fmtN(d.delivered)} / {fmtN(d.target)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex gap-1">
            <button onClick={() => setTab('bulletin')} className={`rounded-md px-2.5 py-1 text-xs ${tab === 'bulletin' ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/5'}`}>
              Auto-drafted bulletin
            </button>
            <button onClick={() => setTab('cap')} className={`rounded-md px-2.5 py-1 text-xs ${tab === 'cap' ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/5'}`}>
              CAP 1.2 XML (SACHET-style)
            </button>
          </div>
          <div className="flex gap-1">
            <button className="btn h-7 px-2 text-xs" onClick={() => navigator.clipboard?.writeText(tab === 'cap' ? cap : a.bulletin)}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button className="btn h-7 px-2 text-xs" onClick={() => (tab === 'cap' ? download(`${a.id}.cap.xml`, cap, 'application/xml') : download(`${a.id}.txt`, a.bulletin))}>
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          </div>
        </div>
        <pre className="scroll-thin max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950/80 p-3 font-mono text-[12px] leading-relaxed text-slate-200">{tab === 'cap' ? cap || 'Building CAP…' : a.bulletin}</pre>
      </div>
    </motion.div>
  );
}

function Mini({ label, value, Icon }: { label: string; value: number; Icon: typeof Bell }) {
  return (
    <div>
      <Icon className="mx-auto h-4 w-4 text-slate-500" />
      <AnimatedNumber value={value} className="font-mono text-lg font-semibold text-white" />
      <div className="text-[10px] leading-tight text-slate-500">{label}</div>
    </div>
  );
}

function Imp({ Icon, label, v, big, sub }: { Icon: typeof Bell; label: string; v: number; big?: boolean; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2" title={sub}>
      <Icon className="h-4 w-4 text-slate-400" />
      <AnimatedNumber value={v} format={big ? (x) => fmtN(Math.round(x)) : undefined} className="mt-1 block font-mono text-lg font-semibold text-white" />
      <div className="text-[10px] text-slate-500">{label}</div>
      {sub && <div className="truncate text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
