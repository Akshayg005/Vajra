import { useEffect, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import type { CitizenReport } from '@vajra/contracts';
import { useStore } from '../../store';
import { ReportFormSchema } from '../../data/schemas';
import { nearestTown } from '../../engine/places';
import { Skeleton, inferenceDelay, wait } from '../Skeleton';

const EVENTS: CitizenReport['event'][] = ['lightning', 'hail', 'damage', 'waterlogging'];
const ST_CLS = { verified: 'text-sev-green', unverified: 'text-sev-yellow', duplicate: 'text-slate-400', fake: 'text-slate-400' };

/** Validated (Zod) report form; photo stays on the device as an object URL (never uploaded). */
export function ReportForm({ pt }: { pt: [number, number] | null }) {
  const simTime = useStore((s) => s.snap?.stats.simTime ?? 0);
  const send = useStore((s) => s.send);
  const apiOnline = useStore((s) => s.apiOnline);
  const [event, setEvent] = useState<CitizenReport['event']>('lightning');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CitizenReport | null>(null);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const submit = async () => {
    const parsed = ReportFormSchema.safeParse({ event, text, lng: pt?.[0] ?? NaN, lat: pt?.[1] ?? NaN, photo });
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => (i.path[0] === 'lng' || i.path[0] === 'lat' ? 'Click on the map to set the location' : i.message)).filter((v, i, a) => a.indexOf(v) === i));
      return;
    }
    setErrors([]);
    setBusy(true);
    setResult(null);
    await wait(inferenceDelay(parsed.data.text));
    const { town, km } = nearestTown(parsed.data.lng, parsed.data.lat);
    const r = await send({
      type: 'report',
      report: { t: simTime, lng: parsed.data.lng, lat: parsed.data.lat, event: parsed.data.event, text: parsed.data.text + (photo ? ' [photo attached]' : ''), place: km < 15 ? town.name : `${km.toFixed(1)} km from ${town.name}`, source: 'app' },
    });
    setResult(r);
    setBusy(false);
    // best-effort copy to the API store (SQLite) when the optional service is running
    if (apiOnline && r) void fetch('/api/v1/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }).catch(() => undefined);
  };

  return (
    <div className="panel absolute right-3 top-3 w-[330px] p-3">
      <div className="panel-title mb-2">Submit a report</div>
      <div className="text-[12px] text-slate-400">{pt ? `Location: ${pt[1].toFixed(3)}°N, ${pt[0].toFixed(3)}°E` : 'Click on the map to set the location.'}</div>
      <div className="mt-2 grid grid-cols-4 gap-1" role="radiogroup" aria-label="Event type">
        {EVENTS.map((e) => (
          <button key={e} role="radio" aria-checked={event === e} onClick={() => setEvent(e)} className={`rounded-md border px-1 py-1 text-[11px] capitalize ${event === e ? 'border-volt/60 bg-volt/15 text-white' : 'border-white/10 text-slate-400'}`}>
            {e}
          </button>
        ))}
      </div>
      <textarea value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder="What do you see? (3-280 characters)" aria-label="Description" className="mt-2 h-16 w-full rounded-md border border-white/10 bg-ink-800 p-2 text-sm outline-none focus:border-volt/60" />
      <div className="mt-1 flex items-center gap-2">
        <label className="btn h-8 cursor-pointer px-2 text-xs">
          <ImagePlus className="h-3.5 w-3.5" /> Photo (optional)
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0])} />
        </label>
        {preview && (
          <span className="relative">
            <img src={preview} alt="Report photo preview" className="h-10 w-10 rounded object-cover" />
            <button className="absolute -right-1.5 -top-1.5 rounded-full bg-ink-900 p-0.5" onClick={() => setPhoto(undefined)} aria-label="Remove photo">
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        <span className="text-[11px] text-slate-500">JPG/PNG/WebP ≤ 5 MB, stays on device</span>
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] text-sev-orange" role="alert">
          {errors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
      <button disabled={busy} onClick={() => void submit()} className="btn btn-primary mt-2 w-full">
        <Send className="h-3.5 w-3.5" /> {busy ? 'Checking against radar & lightning…' : 'Submit & verify'}
      </button>
      {busy && <Skeleton className="mt-2" lines={2} />}
      {result && (
        <div className="mt-2 rounded-md bg-white/[0.04] p-2 text-[12px]">
          <b className={`uppercase ${ST_CLS[result.status]}`}>{result.status}</b> · match {(result.matchScore * 100).toFixed(0)}% · {result.id}
          <div className="text-slate-400">{result.matchReason}</div>
        </div>
      )}
    </div>
  );
}
