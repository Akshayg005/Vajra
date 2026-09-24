import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Anchor, Briefcase, Car, CloudLightning, GraduationCap, HardHat, Home, LocateFixed, MapPin, Plane, Search, Share2, ShieldCheck, Siren, Tent, Timer, Tractor, Zap } from 'lucide-react';
import type { PointNowcast, Severity } from '@vajra/contracts';
import { useStore } from '../store';
import i18n, { LANGS, type Dict } from '../i18n';
import { DISTRICTS, SHELTERS_PER_TOWN, TOWNS, type Town } from '../engine/places';
import { distanceKm, moveKm } from '../engine/geo';
import { fmtIST } from '../lib/format';
import { useSimNow } from '../lib/useNow';
import { RiskDial } from '../components/citizen/RiskDial';
import { renderShareCard, shareOrDownload } from '../components/citizen/shareCard';
import { Skeleton } from '../components/Skeleton';

const PERSONAS = [
  { k: 'farmer', Icon: Tractor, adv: 'advFarmer' },
  { k: 'fisher', Icon: Anchor, adv: 'advFisher' },
  { k: 'commuter', Icon: Car, adv: 'advCommuter' },
  { k: 'parent', Icon: GraduationCap, adv: 'advParent' },
  { k: 'worker', Icon: HardHat, adv: 'advWorker' },
  { k: 'organiser', Icon: Tent, adv: 'advOrganiser' },
  { k: 'pilot', Icon: Plane, adv: 'advPilot' },
] as const satisfies readonly { k: keyof Dict; Icon: typeof Tractor; adv: keyof Dict }[];

type Place = { name: string; lng: number; lat: number };

export default function CitizenView() {
  const { t } = useTranslation();
  const snap = useStore((s) => s.snap)!;
  const adapter = useStore((s) => s.adapter);
  const [lang, setLang] = useState('en');
  const [here, setHere] = useState<Place | null>(null);
  const [dest, setDest] = useState<string>('');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [persona, setPersona] = useState<(typeof PERSONAS)[number]['k']>('farmer');
  const [pn, setPn] = useState<PointNowcast | null>(null);
  const now = useSimNow(1000);
  const towns = useMemo(() => {
    const [w, s, e, n] = snap.scenario.bbox;
    return TOWNS.filter((x) => x.lng > w && x.lng < e && x.lat > s && x.lat < n);
  }, [snap.scenario.id]);
  const places: Place[] = useMemo(() => {
    const [w, s, e, n] = snap.scenario.bbox;
    return [...towns, ...DISTRICTS.filter((d) => d.lng > w && d.lng < e && d.lat > s && d.lat < n).map((d) => ({ name: `${d.name} (district)`, lng: d.lng, lat: d.lat }))];
  }, [towns, snap.scenario.id]);

  useEffect(() => void i18n.changeLanguage(lang), [lang]);
  // initial place: ?place= or the town most at risk (nearest to the strongest storm's 30-min position)
  useEffect(() => {
    const q = new URLSearchParams(location.hash.split('?')[1] ?? '').get('place');
    const byName = q ? places.find((p) => p.name === q) : undefined;
    if (byName) return setHere(byName);
    const c = [...snap.cells].sort((a, b) => b.maxDbz - a.maxDbz)[0];
    const f = c?.forecastTrack[2] ?? c;
    setHere(f ? [...towns].sort((a, b) => distanceKm(a.lng, a.lat, f.lng, f.lat) - distanceKm(b.lng, b.lat, f.lng, f.lat))[0] ?? null : towns[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.scenario.id]);
  useEffect(() => {
    if (!here || !adapter) return;
    void adapter.pointNowcast(here.lat, here.lng, 60).then((r) => setPn(r));
  }, [here, snap.stats.tick, adapter]);

  const locate = () => {
    if (!('geolocation' in navigator)) return setNote(t('outsideArea'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords;
        const [w, s, e, n] = snap.scenario.bbox;
        const inside = lng > w && lng < e && lat > s && lat < n;
        const nearest = [...towns].sort((a, b) => distanceKm(a.lng, a.lat, lng, lat) - distanceKm(b.lng, b.lat, lng, lat))[0];
        setHere(inside ? { name: `${lat.toFixed(3)}°N ${lng.toFixed(3)}°E`, lng, lat } : nearest);
        setNote(inside ? '' : t('outsideArea'));
      },
      () => setNote(t('outsideArea')),
      { timeout: 5000 },
    );
  };

  const near = here ? snap.strikes.filter((s) => distanceKm(s.lng, s.lat, here.lng, here.lat) < 10) : [];
  const lastNear = near.length ? Math.max(...near.map((s) => s.t)) : null;
  const sinceMin = lastNear !== null ? (now - lastNear) / 60000 : null;
  const p = pn?.probability ?? 0;
  const etaMs = pn?.etaMin != null ? pn.etaMin * 60000 - (now - snap.stats.simTime) : null;
  const status: 'safe' | 'caution' | 'danger' = (sinceMin !== null && sinceMin < 30) || p >= 0.6 || (etaMs !== null && etaMs <= 15 * 60000) ? 'danger' : p >= 0.25 ? 'caution' : 'safe';
  const color = status === 'danger' ? '#ef4444' : status === 'caution' ? '#fb923c' : '#22c55e';
  const sev: Severity = status === 'danger' ? 'red' : status === 'caution' ? 'orange' : 'green';
  const there = towns.find((x) => x.name === dest) ?? towns.find((x) => x.name !== here?.name);
  const commute = useMemo(() => (here && there ? planCommute(here, there, snap.cells) : null), [here, there, snap.stats.tick]);
  const shelters = here ? [0, 1, 2].map((k) => ({ name: `${SHELTERS_PER_TOWN[(here.name.length + k * 2) % SHELTERS_PER_TOWN.length]}, ${here.name.split(' (')[0]}`, m: 180 + ((here.name.charCodeAt(0) * (k + 3)) % 600) })) : [];
  const adv = t(PERSONAS.find((x) => x.k === persona)!.adv);
  const countdown = etaMs !== null && etaMs > 0 ? `${Math.floor(etaMs / 60000)}:${String(Math.floor((etaMs % 60000) / 1000)).padStart(2, '0')}` : null;

  const share = async () => {
    const blob = await renderShareCard({ place: here?.name ?? '', status: t(status), risk: `${t('riskNext60')}: ${(p * 100).toFixed(0)}%`, eta: pn?.etaMin != null ? `${t('arrivesIn')}: ${pn.etaMin} ${t('min')}` : null, advice: adv, footer: `${fmtIST(now)} IST · VAJRA nowcast (prototype)`, color });
    await shareOrDownload(blob);
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-ink-900 to-ink-950 scroll-thin">
      <div className="mx-auto max-w-[430px] space-y-3 p-4 pb-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-volt/30 to-plasma/30">
              <Zap className="h-5 w-5 text-volt" />
            </div>
            <div>
              <div className="text-base font-bold tracking-widest text-white">VAJRA</div>
              <div className="text-[11px] uppercase tracking-widest text-slate-400">{t('amISafe')}</div>
            </div>
          </div>
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-lg border border-white/10 bg-ink-800 px-2 py-2 text-sm" aria-label="Language">
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </header>

        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-ink-800/80 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              list="vajra-places"
              value={query}
              placeholder={here?.name ?? t('searchPlace')}
              aria-label={t('searchPlace')}
              onChange={(e) => {
                setQuery(e.target.value);
                const m = places.find((x) => x.name.toLowerCase() === e.target.value.toLowerCase());
                if (m) {
                  setHere(m);
                  setQuery('');
                  setNote('');
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-300"
            />
            <datalist id="vajra-places">
              {places.map((x) => (
                <option key={x.name} value={x.name} />
              ))}
            </datalist>
          </label>
          <button className="btn h-auto px-3" onClick={locate} aria-label={t('useLocation')} title={t('useLocation')}>
            <LocateFixed className="h-4 w-4" />
          </button>
        </div>
        {note && <div className="rounded-lg bg-sev-yellow/10 px-3 py-1.5 text-xs text-sev-yellow">{note}</div>}

        <motion.div layout className="relative overflow-hidden rounded-2xl border p-5" style={{ borderColor: color + '80', background: `radial-gradient(120% 90% at 0% 0%, ${color}33, transparent 60%), #0b1120` }} aria-live="polite">
          {status === 'danger' && <div className="absolute right-4 top-4 h-3 w-3 animate-ping rounded-full bg-sev-red" />}
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color }}>
            {status === 'danger' ? <Siren className="h-5 w-5" /> : status === 'caution' ? <CloudLightning className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            <span className="uppercase tracking-wider">{sev.toUpperCase()}</span>
            <span className="ml-auto flex items-center gap-1 text-xs font-normal text-slate-300">
              <MapPin className="h-3.5 w-3.5" />
              {here?.name}
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold leading-tight text-white">{t(status)}</div>
          {!pn ? (
            <Skeleton className="mt-4" lines={3} />
          ) : (
            <div className="mt-2 grid grid-cols-2 items-center gap-2">
              <div>
                <RiskDial p={p} color={color} label={t('riskNext60')} />
                <div className="text-center text-[11px] text-slate-400">{t('riskNext60')}</div>
              </div>
              <div className="text-center">
                <div className="text-[11px] text-slate-400">{t('arrivesIn')}</div>
                <div className="font-mono text-4xl font-bold tnum" style={{ color }}>
                  {countdown ?? '—'}
                </div>
                {countdown && <div className="text-[11px] text-slate-400">mm:ss</div>}
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Zap className="h-4 w-4 text-volt" /> {t('nearestStrike')}
            </span>
            <span className="font-mono tnum text-white">{pn?.nearestStrikeKm != null ? `${pn.nearestStrikeKm.toFixed(1)} ${t('km')}` : '—'}</span>
          </div>
          {status === 'safe' && <div className="mt-2 text-xs text-slate-400">{t('noStorm')}</div>}
        </motion.div>

        <section className="rounded-2xl border border-white/10 bg-ink-800/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Timer className="h-4 w-4 text-plasma" /> {t('rule3030')}
          </div>
          <p className="mt-1 text-xs text-slate-400">{t('rule3030Desc')}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="relative h-16 w-16 shrink-0">
              <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden>
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1e293b" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={sinceMin !== null && sinceMin < 30 ? '#ef4444' : '#22c55e'} strokeWidth="3" strokeDasharray={`${Math.min(1, (sinceMin ?? 30) / 30) * 97.4} 97.4`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 grid place-items-center font-mono text-sm font-bold text-white">{sinceMin !== null && sinceMin < 30 ? Math.ceil(30 - sinceMin) : '✓'}</div>
            </div>
            <div className="text-sm text-slate-300">
              {sinceMin !== null && sinceMin < 30 ? (
                <>
                  {t('lastThunder')}: <b className="font-mono text-white">{sinceMin.toFixed(1)} {t('min')}</b>. {t('stayInside', { n: Math.ceil(30 - sinceMin) })}
                </>
              ) : (
                t('clear30')
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-ink-800/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Home className="h-4 w-4 text-volt" /> {t('shelter')}
          </div>
          <div className="mt-2 space-y-1.5">
            {shelters.map((s) => (
              <div key={s.name} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm">
                <span className="text-slate-200">{s.name}</span>
                <span className="font-mono text-slate-400 tnum">{s.m} m</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-ink-800/70 p-4">
          <div className="text-sm font-semibold text-white">{t('persona')}</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5" role="tablist">
            {PERSONAS.map(({ k, Icon }) => (
              <button key={k} role="tab" aria-selected={persona === k} onClick={() => setPersona(k)} className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] ${persona === k ? 'border-volt/60 bg-volt/15 text-white' : 'border-white/10 text-slate-400'}`}>
                <Icon className="h-5 w-5" />
                {t(k)}
              </button>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-black/20 p-3 text-sm leading-relaxed text-slate-200" role="tabpanel">
            {adv}
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-ink-800/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Briefcase className="h-4 w-4 text-plasma" /> {t('commutePlanner')}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="truncate text-slate-400">{here?.name.split(' (')[0]} →</span>
            <select value={there?.name ?? ''} onChange={(e) => setDest(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5" aria-label="Destination">
              {towns
                .filter((x) => x.name !== here?.name)
                .map((x) => (
                  <option key={x.name}>{x.name}</option>
                ))}
            </select>
          </div>
          {commute && (
            <div className={`mt-3 rounded-lg p-3 text-sm font-semibold ${commute.leaveNow ? 'bg-sev-green/15 text-sev-green' : 'bg-sev-orange/15 text-sev-orange'}`}>
              {commute.leaveNow ? t('leaveNow') : t('waitMin', { n: commute.wait })}
              <div className="mt-0.5 text-xs font-normal text-slate-400">
                {commute.d.toFixed(1)} km · ~{commute.travel} min by road · checked against every tracked storm path
              </div>
            </div>
          )}
        </section>

        <button onClick={() => void share()} className="btn btn-primary h-12 w-full text-base">
          <Share2 className="h-5 w-5" /> {t('share')}
        </button>
        <div className="text-center text-[11px] text-slate-500">Prototype · simulated data · {fmtIST(now, true)} IST</div>
      </div>
    </div>
  );
}

function planCommute(here: Place, there: Town, cells: { lng: number; lat: number; headingDeg: number; speedKmh: number; radiusKm: number; maxDbz: number }[]) {
  const d = distanceKm(here.lng, here.lat, there.lng, there.lat);
  const travel = Math.round((d / 35) * 60);
  const risky = (startMin: number) => {
    for (let m = startMin; m <= startMin + travel; m += 5) {
      const f = (m - startMin) / Math.max(1, travel);
      const lng = here.lng + (there.lng - here.lng) * f;
      const lat = here.lat + (there.lat - here.lat) * f;
      for (const c of cells) {
        if (c.maxDbz < 45) continue;
        const [cl, ct] = moveKm(c.lng, c.lat, c.headingDeg, (c.speedKmh * m) / 60);
        if (distanceKm(cl, ct, lng, lat) < c.radiusKm + 8) return true;
      }
    }
    return false;
  };
  if (!risky(0)) return { leaveNow: true, wait: 0, travel, d };
  for (let w = 10; w <= 180; w += 10) if (!risky(w)) return { leaveNow: false, wait: w, travel, d };
  return { leaveNow: false, wait: 180, travel, d };
}
