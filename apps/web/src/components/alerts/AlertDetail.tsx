import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Anchor, Bell, Copy, Download, Factory, FileCode2, GitMerge, GraduationCap, MessageCircle, Pencil, Plane, Printer, Route, Send, Siren, Smartphone, Tractor, Users, VolumeX } from 'lucide-react';
import type { Alert, Channel } from '@vajra/contracts';
import { useStore } from '../../store';
import { SeverityBadge } from '../SeverityBadge';
import { AnimatedNumber } from '../AnimatedNumber';
import { Skeleton, inferenceDelay, wait } from '../Skeleton';
import { PolygonEditor } from './PolygonEditor';
import { download, fmtIST, fmtN } from '../../lib/format';
import { hazardText } from '../../engine/alerts';
import { BLANGS, bulletinFor, type BLang } from '../../lib/bulletinI18n';
import { isLive } from '../../selectors';
import { HELP } from '../../lib/help';

export const CH: Record<Channel, { label: string; Icon: typeof Bell }> = {
  sms: { label: 'SMS (cell broadcast)', Icon: Smartphone },
  whatsapp: { label: 'WhatsApp', Icon: MessageCircle },
  push: { label: 'App push', Icon: Bell },
  siren: { label: 'Sirens', Icon: Siren },
  cap: { label: 'CAP 1.2 feed', Icon: FileCode2 },
};

export function AlertDetail({ a, others, onPrint }: { a: Alert; others: Alert[]; onPrint: (lang: BLang) => void }) {
  const adapter = useStore((s) => s.adapter);
  const send = useStore((s) => s.send);
  const simTime = useStore((s) => s.snap?.stats.simTime ?? 0);
  const [tab, setTab] = useState<'bulletin' | 'cap'>('bulletin');
  const [lang, setLang] = useState<BLang>('en');
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [mergeInto, setMergeInto] = useState('');
  useEffect(() => {
    if (tab === 'cap') void adapter?.capXml(a.id).then((x) => setCap(x ?? ''));
  }, [a.id, a.updatedAt, tab, adapter]);
  useEffect(() => {
    setEditing(false);
    setMergeInto('');
  }, [a.id]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    await wait(inferenceDelay(label + a.id));
    await fn();
    setBusy(null);
  };
  const imp = a.impact;
  const bulletin = bulletinFor(a, lang);
  const live = isLive(a);

  return (
    <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={a.severity} withAction />
              <span className="chip">{hazardText(a.hazard)}</span>
              <span className="chip font-mono uppercase">{a.status}</span>
              {a.issuedBy && <span className="chip">issued by {a.issuedBy}</span>}
              {a.edited && <span className="chip text-plasma-soft">polygon edited</span>}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">{a.headline}</h2>
            <div className="mt-1 font-mono text-xs text-slate-400">
              {a.id} · issued {fmtIST(a.issuedAt)} · updated {fmtIST(a.updatedAt, true)} · valid to {fmtIST(a.expiresAt)} IST · storm {a.cellId}
            </div>
          </div>
          <div className="text-right" title={HELP.probability}>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Probability</div>
            <AnimatedNumber value={a.probability * 100} decimals={1} suffix="%" className="font-mono text-3xl font-bold text-white" />
            <div className="font-mono text-xs text-slate-400">
              ETA {a.etaMin} min · {fmtIST(simTime + a.etaMin * 60000)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {a.status === 'draft' || a.status === 'suppressed' ? (
            <button className="btn btn-primary" disabled={!!busy} onClick={() => act('issue', () => send({ type: 'alertIssue', id: a.id }))}>
              <Send className="h-4 w-4" /> {busy === 'issue' ? 'Issuing… building CAP & queueing channels' : 'Issue warning'}
            </button>
          ) : null}
          {live && a.status !== 'suppressed' && (
            <button className="btn" disabled={!!busy} onClick={() => act('suppress', () => send({ type: 'alertSuppress', id: a.id }))} title="Stop dissemination (duplicate or repeat)">
              <VolumeX className="h-4 w-4" /> {busy === 'suppress' ? 'Suppressing…' : 'Suppress'}
            </button>
          )}
          {live && (
            <span className="flex items-center gap-1">
              <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="rounded-md border border-white/10 bg-ink-800 px-2 py-1.5 text-sm" aria-label="Merge into warning">
                <option value="">Merge into…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} ({o.severity}, {o.district})
                  </option>
                ))}
              </select>
              <button className="btn" disabled={!mergeInto || !!busy} onClick={() => act('merge', () => send({ type: 'alertMerge', id: a.id, into: mergeInto }))}>
                <GitMerge className="h-4 w-4" /> {busy === 'merge' ? 'Merging…' : 'Merge'}
              </button>
            </span>
          )}
          {live && !editing && (
            <button className="btn" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit polygon
            </button>
          )}
        </div>
        {editing && (
          <div className="mt-3">
            <PolygonEditor
              alert={a}
              onCancel={() => setEditing(false)}
              onSave={(p) =>
                void act('polygon', async () => {
                  await send({ type: 'alertPolygon', id: a.id, polygon: p });
                  setEditing(false);
                })
              }
            />
          </div>
        )}
        <div className="mt-3">
          <div className="panel-title mb-1.5">Warned areas (state → district → block → panchayat)</div>
          <div className="flex flex-wrap gap-1.5">
            {a.areas.map((x, i) => (
              <span key={i} className="chip">
                <span className="text-[9px] uppercase text-slate-500">{x.level}</span> {x.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="panel p-3" title={HELP.impact}>
        <div className="panel-title mb-2">Impact — what this storm will do</div>
        {busy === 'polygon' ? (
          <Skeleton lines={2} />
        ) : (
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
        )}
      </div>
      <div className="panel p-3">
        <div className="panel-title mb-2">Delivery for this warning {a.status === 'draft' ? '(starts when issued)' : ''}</div>
        <div className="space-y-1.5">
          {a.delivery.map((d) => (
            <div key={d.channel} className="grid grid-cols-[160px_1fr_190px] items-center gap-3 text-[12px]">
              <span className="flex items-center gap-1.5 text-slate-300">
                {(() => {
                  const I = CH[d.channel].Icon;
                  return <I className="h-3.5 w-3.5" />;
                })()}
                {CH[d.channel].label}
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div className="h-2 rounded-full bg-gradient-to-r from-volt to-plasma" style={{ width: `${(d.delivered / Math.max(1, d.target)) * 100}%`, transition: 'width 400ms ease-out' }} />
              </div>
              <span className="text-right font-mono text-slate-300 tnum">
                <AnimatedNumber value={d.delivered} format={(v) => fmtN(Math.round(v))} /> / {fmtN(d.target)}
                {d.failed > 0 && <span className="ml-1 text-sev-orange">({fmtN(d.failed)} failed)</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1" role="tablist">
            <button role="tab" aria-selected={tab === 'bulletin'} onClick={() => setTab('bulletin')} className={`rounded-md px-2.5 py-1 text-xs ${tab === 'bulletin' ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/5'}`}>
              Auto-drafted bulletin
            </button>
            <button role="tab" aria-selected={tab === 'cap'} onClick={() => setTab('cap')} className={`rounded-md px-2.5 py-1 text-xs ${tab === 'cap' ? 'bg-volt/20 text-volt' : 'text-slate-400 hover:bg-white/5'}`}>
              CAP 1.2 XML (SACHET-style)
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {tab === 'bulletin' && (
              <select value={lang} onChange={(e) => setLang(e.target.value as BLang)} className="rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-xs" aria-label="Bulletin language">
                {BLANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            )}
            <button className="btn h-7 px-2 text-xs" onClick={() => void navigator.clipboard?.writeText(tab === 'cap' ? cap : bulletin)}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button className="btn h-7 px-2 text-xs" onClick={() => void adapter?.capXml(a.id).then((x) => x && download(`${a.id}.cap.xml`, x, 'application/xml'))}>
              <Download className="h-3.5 w-3.5" /> CAP XML
            </button>
            <button className="btn h-7 px-2 text-xs" onClick={() => onPrint(lang)}>
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </button>
          </div>
        </div>
        <pre className="scroll-thin max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950/80 p-3 font-mono text-[12.5px] leading-relaxed text-slate-200">{tab === 'cap' ? cap || 'Building CAP…' : bulletin}</pre>
      </div>
    </motion.div>
  );
}

function Imp({ Icon, label, v, big, sub }: { Icon: typeof Bell; label: string; v: number; big?: boolean; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2" title={sub}>
      <Icon className="h-4 w-4 text-slate-400" />
      <AnimatedNumber value={v} format={big ? (x) => fmtN(Math.round(x)) : undefined} className="mt-1 block font-mono text-lg font-semibold text-white" />
      <div className="text-[10px] text-slate-400">{label}</div>
      {sub && <div className="truncate text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
