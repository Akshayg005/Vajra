import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Radio } from 'lucide-react';
import type { Channel } from '@vajra/contracts';
import { useStore } from '../store';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { AlertList, type AlertFilter } from '../components/alerts/AlertList';
import { AlertDetail, CH } from '../components/alerts/AlertDetail';
import { fmtIST, fmtN } from '../lib/format';
import { downloadCsv } from '../lib/exports';
import { bulletinFor, type BLang } from '../lib/bulletinI18n';
import { isLive } from '../selectors';
import { SeverityBadge } from '../components/SeverityBadge';

export default function AlertCenter() {
  const alerts = useStore((s) => s.snap?.alerts ?? []);
  const simTime = useStore((s) => s.snap?.stats.simTime ?? 0);
  const [params] = useSearchParams();
  const [sel, setSel] = useState<string | null>(params.get('id'));
  const [filter, setFilter] = useState<AlertFilter>('live');
  const [print, setPrint] = useState<{ id: string; lang: BLang } | null>(null);
  const liveList = alerts.filter(isLive);
  const a = alerts.find((x) => x.id === sel) ?? liveList[0] ?? alerts[alerts.length - 1];
  const totals = (['sms', 'whatsapp', 'push', 'siren', 'cap'] as Channel[]).map((ch) => ({
    ch,
    sent: alerts.reduce((s, x) => s + (x.delivery.find((d) => d.channel === ch)?.sent ?? 0), 0),
    delivered: alerts.reduce((s, x) => s + (x.delivery.find((d) => d.channel === ch)?.delivered ?? 0), 0),
    failed: alerts.reduce((s, x) => s + (x.delivery.find((d) => d.channel === ch)?.failed ?? 0), 0),
  }));

  // printable bulletin: render a print-only sheet, then open the browser print dialog (Save as PDF)
  useEffect(() => {
    if (!print) return;
    const t = setTimeout(() => {
      window.print();
      setPrint(null);
    }, 120);
    return () => clearTimeout(t);
  }, [print]);
  const pa = print ? alerts.find((x) => x.id === print.id) : null;

  return (
    <>
      <div className="no-print grid h-full grid-cols-[420px_1fr] gap-3 overflow-hidden p-3">
        <AlertList alerts={alerts} selectedId={a?.id} onSelect={setSel} filter={filter} setFilter={setFilter} />
        <div className="scroll-thin min-h-0 space-y-3 overflow-y-auto pr-1">
          <div className="panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="panel-title flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5" /> Dissemination — live delivery counters (all warnings)
              </span>
              <button className="btn h-7 px-2 text-xs" onClick={() => downloadCsv(alerts, simTime)}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {totals.map((t) => {
                const I = CH[t.ch].Icon;
                return (
                  <div key={t.ch} className="rounded-lg bg-white/[0.03] p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <I className="h-3.5 w-3.5" />
                      {CH[t.ch].label}
                    </div>
                    <AnimatedNumber value={t.delivered} format={(v) => fmtN(Math.round(v))} className="font-mono text-xl font-semibold text-white" />
                    <div className="font-mono text-[10px] text-slate-500 tnum">
                      sent {fmtN(t.sent)} · failed {fmtN(t.failed)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {a ? <AlertDetail a={a} others={liveList.filter((x) => x.id !== a.id)} onPrint={(lang) => setPrint({ id: a.id, lang })} /> : <div className="panel p-6 text-slate-500">No warnings yet. They are created automatically when a storm crosses the thresholds.</div>}
        </div>
      </div>
      {pa && print && (
        <div className="print-only">
          <h1>VAJRA Nowcast Warning — {pa.id}</h1>
          <p>
            <SeverityBadge severity={pa.severity} withAction /> · {pa.district}, {pa.state} · issued {fmtIST(pa.issuedAt)} IST · valid to {fmtIST(pa.expiresAt)} IST
          </p>
          <pre>{bulletinFor(pa, print.lang)}</pre>
          <p>Warned areas: {pa.areas.map((x) => `${x.level}: ${x.name}`).join(' · ')}</p>
          <p>Prototype (simulated data) — VAJRA SIH26072</p>
        </div>
      )}
    </>
  );
}
