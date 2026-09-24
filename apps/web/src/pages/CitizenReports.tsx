import { useMemo, useState } from 'react';
import { CheckCircle2, CircleSlash, Copy, HelpCircle, MapPin, Send } from 'lucide-react';
import type { CitizenReport } from '@vajra/contracts';
import { useStore } from '../store';
import { MapView, activeMap } from '../components/MapView';
import { fmtIST } from '../lib/format';
import { nearestTown } from '../engine/places';

const EVENTS: CitizenReport['event'][] = ['lightning', 'hail', 'damage', 'waterlogging'];
const STATUS: CitizenReport['status'][] = ['verified', 'unverified', 'duplicate', 'fake'];
const ST_ICON = { verified: CheckCircle2, unverified: HelpCircle, duplicate: Copy, fake: CircleSlash };
const ST_CLS = { verified: 'text-sev-green', unverified: 'text-sev-yellow', duplicate: 'text-slate-400', fake: 'text-slate-500' };

/** strip anything that is not plain text (reports are untrusted input) */
const sanitize = (s: string) => s.replace(/[<>{}`$\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 280);

export default function CitizenReports() {
  const reports = useStore((s) => s.snap?.reports ?? []);
  const simTime = useStore((s) => s.snap?.stats.simTime ?? 0);
  const send = useStore((s) => s.send);
  const [ev, setEv] = useState<Set<string>>(new Set(EVENTS));
  const [st, setSt] = useState<Set<string>>(new Set(STATUS));
  const [hours, setHours] = useState(3);
  const [q, setQ] = useState('');
  const [pt, setPt] = useState<[number, number] | null>(null);
  const [form, setForm] = useState<{ event: CitizenReport['event']; text: string }>({ event: 'lightning', text: '' });
  const [result, setResult] = useState<CitizenReport | null>(null);

  const list = useMemo(
    () =>
      [...reports]
        .reverse()
        .filter((r) => ev.has(r.event) && st.has(r.status) && simTime - r.t <= hours * 3600e3 && (!q || r.place.toLowerCase().includes(q.toLowerCase()) || r.text.toLowerCase().includes(q.toLowerCase()))),
    [reports, ev, st, hours, q, simTime],
  );
  const toggle = (set: Set<string>, v: string, f: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    f(n);
  };
  const submit = async () => {
    if (!pt) return;
    const { town, km } = nearestTown(pt[0], pt[1]);
    const r = await send({
      type: 'report',
      report: { t: simTime, lng: pt[0], lat: pt[1], event: form.event, text: sanitize(form.text) || `${form.event} reported`, place: km < 15 ? town.name : `${Math.round(km)} km from ${town.name}`, source: 'app' },
    });
    setResult(r);
    // best-effort copy to the API store (SQLite); ignored when offline
    fetch('/api/v1/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }).catch(() => undefined);
  };

  return (
    <div className="grid h-full grid-cols-[440px_1fr] gap-3 overflow-hidden p-3">
      <div className="panel flex min-h-0 flex-col">
        <div className="space-y-2 border-b border-white/5 p-3">
          <div className="panel-title">Crowd reports · AI-checked against radar & lightning</div>
          <div className="flex flex-wrap gap-1">
            {EVENTS.map((e) => (
              <button key={e} onClick={() => toggle(ev, e, setEv)} className={`rounded-md border px-2 py-0.5 text-xs capitalize ${ev.has(e) ? 'border-volt/50 bg-volt/10 text-white' : 'border-white/10 text-slate-500'}`}>
                {e}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS.map((e) => (
              <button key={e} onClick={() => toggle(st, e, setSt)} className={`rounded-md border px-2 py-0.5 text-xs capitalize ${st.has(e) ? 'border-plasma/50 bg-plasma/10 text-white' : 'border-white/10 text-slate-500'}`}>
                {e} <span className="font-mono text-slate-400">{reports.filter((r) => r.status === e).length}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by place or text" className="flex-1 rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-xs outline-none focus:border-volt/60" />
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-xs">
              {[1, 3, 6].map((h) => (
                <option key={h} value={h}>
                  last {h} h
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {list.map((r) => {
            const I = ST_ICON[r.status];
            return (
              <button key={r.id} onClick={() => activeMap?.flyTo({ center: [r.lng, r.lat], zoom: 9 })} className="w-full border-b border-white/[0.04] px-3 py-2 text-left hover:bg-white/5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`flex items-center gap-1 font-semibold uppercase ${ST_CLS[r.status]}`}>
                    <I className="h-3.5 w-3.5" /> {r.status}
                  </span>
                  <span className="font-mono text-slate-500">
                    {r.id} · {fmtIST(r.t)} · {r.source}
                  </span>
                </div>
                <div className="mt-0.5 text-[13px] text-slate-100">
                  <span className="capitalize text-volt">{r.event}</span> — “{r.text}”
                </div>
                <div className="text-[11px] text-slate-400">
                  <MapPin className="mr-0.5 inline h-3 w-3" />
                  {r.place} · match {Math.round(r.matchScore * 100)}% · {r.matchReason}
                  {r.duplicateOf ? ` (dup of ${r.duplicateOf})` : ''}
                </div>
              </button>
            );
          })}
          {!list.length && <div className="p-6 text-sm text-slate-500">No reports match the filters.</div>}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-white/[0.07]">
        <MapView onMapClick={(lng, lat) => setPt([lng, lat])} />
        <div className="panel absolute right-3 top-3 w-[320px] p-3">
          <div className="panel-title mb-2">Submit a report (test)</div>
          <div className="text-[11px] text-slate-400">{pt ? `Location: ${pt[1].toFixed(3)}°N, ${pt[0].toFixed(3)}°E` : 'Click on the map to set the location.'}</div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {EVENTS.map((e) => (
              <button key={e} onClick={() => setForm({ ...form, event: e })} className={`rounded-md border px-1 py-1 text-[10px] capitalize ${form.event === e ? 'border-volt/60 bg-volt/15 text-white' : 'border-white/10 text-slate-400'}`}>
                {e}
              </button>
            ))}
          </div>
          <textarea value={form.text} maxLength={280} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="What do you see?" className="mt-2 h-16 w-full rounded-md border border-white/10 bg-ink-800 p-2 text-xs outline-none focus:border-volt/60" />
          <button disabled={!pt} onClick={submit} className="btn btn-primary mt-2 w-full">
            <Send className="h-3.5 w-3.5" /> Submit & verify
          </button>
          {result && (
            <div className="mt-2 rounded-md bg-white/[0.04] p-2 text-[11px]">
              <b className={`uppercase ${ST_CLS[result.status]}`}>{result.status}</b> · match {Math.round(result.matchScore * 100)}%
              <div className="text-slate-400">{result.matchReason}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
