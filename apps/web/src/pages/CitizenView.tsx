import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Anchor, Briefcase, Car, CloudLightning, GraduationCap, HardHat, Home, MapPin, Plane, Share2, ShieldCheck, Siren, Tent, Timer, Tractor, Zap } from 'lucide-react';
import type { PointNowcast, Severity } from '@vajra/contracts';
import { useStore } from '../store';
import { LANGS } from '../i18n';
import { SHELTERS_PER_TOWN, TOWNS } from '../engine/places';
import { distanceKm, moveKm } from '../engine/geo';
import { SEV_HEX, fmtIST } from '../lib/format';
import i18n from '../i18n';

const PERSONAS = [
  { k: 'farmer', Icon: Tractor, adv: 'advFarmer' },
  { k: 'fisher', Icon: Anchor, adv: 'advFisher' },
  { k: 'commuter', Icon: Car, adv: 'advCommuter' },
  { k: 'parent', Icon: GraduationCap, adv: 'advParent' },
  { k: 'worker', Icon: HardHat, adv: 'advWorker' },
  { k: 'organiser', Icon: Tent, adv: 'advOrganiser' },
  { k: 'pilot', Icon: Plane, adv: 'advPilot' },
] as const;

export default function CitizenView() {
  const { t } = useTranslation();
  const snap = useStore((s) => s.snap)!;
  const adapter = useStore((s) => s.adapter);
  const [lang, setLang] = useState('en');
  const towns = useMemo(() => {
    const [w, s, e, n] = snap.scenario.bbox;
    return TOWNS.filter((x) => x.lng > w && x.lng < e && x.lat > s && x.lat < n);
  }, [snap.scenario.id]);
  const [home, setHome] = useState<string>('');
  const [dest, setDest] = useState<string>('');
  const [persona, setPersona] = useState<(typeof PERSONAS)[number]['k']>('farmer');
  const [pn, setPn] = useState<PointNowcast | null>(null);
  const cardRef = useRef<HTMLCanvasElement>(null);
  const here = towns.find((x) => x.name === home) ?? towns[0];
  const there = towns.find((x) => x.name === dest) ?? towns[1] ?? towns[0];

  useEffect(() => {
    i18n.changeLanguage(lang);
  }, [lang]);
  useEffect(() => {
    if (!home && towns.length) {
      // open on the town most at risk: nearest to the strongest storm's 30-min position
      const c = [...snap.cells].sort((a, b) => b.maxDbz - a.maxDbz)[0];
      const f = c?.forecastTrack[2] ?? c;
      const best = f ? [...towns].sort((a, b) => distanceKm(a.lng, a.lat, f.lng, f.lat) - distanceKm(b.lng, b.lat, f.lng, f.lat))[0] : towns[0];
      setHome(best.name);
    }
    if (!dest && towns.length > 1) setDest(towns[1].name);
  }, [towns]);
  useEffect(() => {
    if (!here || !adapter) return;
    adapter.pointNowcast(here.lat, here.lng, 60).then((r) => setPn(r));
  }, [here?.name, snap.stats.tick, adapter]);

  const sim = snap.stats.simTime;
  const near = here ? snap.strikes.filter((s) => distanceKm(s.lng, s.lat, here.lng, here.lat) < 10) : [];
  const lastNear = near.length ? Math.max(...near.map((s) => s.t)) : null;
  const sinceMin = lastNear ? (sim - lastNear) / 60000 : null;
  const p = pn?.probability ?? 0;
  const status: 'safe' | 'caution' | 'danger' = (sinceMin !== null && sinceMin < 30) || p >= 0.6 || (pn?.etaMin !== null && (pn?.etaMin ?? 99) <= 15) ? 'danger' : p >= 0.25 ? 'caution' : 'safe';
  const color = status === 'danger' ? '#ef4444' : status === 'caution' ? '#fb923c' : '#22c55e';
  const sev: Severity = status === 'danger' ? 'red' : status === 'caution' ? 'orange' : 'green';

  // commute: leave now vs wait
  const commute = useMemo(() => {
    if (!here || !there) return null;
    const d = distanceKm(here.lng, here.lat, there.lng, there.lat);
    const travel = Math.round((d / 35) * 60);
    const risky = (startMin: number) => {
      for (let m = startMin; m <= startMin + travel; m += 5) {
        const f = (m - startMin) / Math.max(1, travel);
        const lng = here.lng + (there.lng - here.lng) * f;
        const lat = here.lat + (there.lat - here.lat) * f;
        for (const c of snap.cells) {
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
  }, [here?.name, there?.name, snap.stats.tick]);

  const shelters = useMemo(() => {
    if (!here) return [];
    return [0, 1, 2].map((k) => ({ name: `${SHELTERS_PER_TOWN[(here.name.length + k * 2) % SHELTERS_PER_TOWN.length]}, ${here.name}`, m: 180 + ((here.name.charCodeAt(0) * (k + 3)) % 600) }));
  }, [here?.name]);

  const share = async () => {
    const c = cardRef.current!;
    const g = c.getContext('2d')!;
    g.fillStyle = '#070b16';
    g.fillRect(0, 0, 1080, 1080);
    g.fillStyle = color;
    g.fillRect(0, 0, 1080, 26);
    g.fillStyle = '#fff';
    g.font = '700 64px Inter, "Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Oriya", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Kannada", sans-serif';
    g.fillText(`⚡ VAJRA · ${here?.name ?? ''}`, 60, 140);
    g.font = '700 84px Inter, "Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Oriya", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Kannada", sans-serif';
    g.fillStyle = color;
    wrap(g, t(status), 60, 300, 960, 96);
    g.fillStyle = '#e2e8f0';
    g.font = '500 46px Inter, "Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Oriya", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Kannada", sans-serif';
    wrap(g, `${t('riskNext60')}: ${Math.round(p * 100)}%`, 60, 470, 960, 60);
    if (pn?.etaMin !== null && pn?.etaMin !== undefined) wrap(g, `${t('arrivesIn')}: ${pn.etaMin} ${t('min')}`, 60, 560, 960, 60);
    wrap(g, t(PERSONAS.find((x) => x.k === persona)!.adv), 60, 680, 960, 58);
    g.fillStyle = '#64748b';
    g.font = '400 32px Inter, sans-serif';
    g.fillText(`${fmtIST(sim)} IST · VAJRA nowcast prototype`, 60, 1030);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    const file = new File([blob], 'vajra-warning.png', { type: 'image/png' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav: any = navigator;
    if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: 'VAJRA warning' }).catch(() => undefined);
    else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'vajra-warning.png';
      a.click();
    }
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
              <div className="text-[10px] uppercase tracking-widest text-slate-500">{t('amISafe')}</div>
            </div>
          </div>
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-lg border border-white/10 bg-ink-800 px-2 py-1.5 text-sm" aria-label="Language">
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </header>

        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-800/80 px-3 py-2">
          <MapPin className="h-4 w-4 text-volt" />
          <select value={here?.name} onChange={(e) => setHome(e.target.value)} className="flex-1 bg-transparent text-sm outline-none">
            {towns.map((x) => (
              <option key={x.name} value={x.name} className="bg-ink-800">
                {x.name}
              </option>
            ))}
          </select>
        </label>

        <motion.div layout className="relative overflow-hidden rounded-2xl border p-5" style={{ borderColor: color + '80', background: `radial-gradient(120% 90% at 0% 0%, ${color}33, transparent 60%), #0b1120` }}>
          {status === 'danger' && <div className="absolute right-4 top-4 h-3 w-3 animate-ping rounded-full bg-sev-red" />}
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color }}>
            {status === 'danger' ? <Siren className="h-5 w-5" /> : status === 'caution' ? <CloudLightning className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            <span className="uppercase tracking-wider">{sev.toUpperCase()}</span>
          </div>
          <div className="mt-2 text-2xl font-bold leading-tight text-white">{t(status)}</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-slate-400">{t('riskNext60')}</div>
              <div className="font-mono text-4xl font-bold tnum text-white">{Math.round(p * 100)}%</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">{t('arrivesIn')}</div>
              <div className="font-mono text-4xl font-bold tnum" style={{ color }}>
                {pn?.etaMin !== null && pn?.etaMin !== undefined ? (
                  <>
                    {pn.etaMin}
                    <span className="text-base text-slate-400"> {t('min')}</span>
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Zap className="h-4 w-4 text-volt" /> {t('nearestStrike')}
            </span>
            <span className="font-mono tnum text-white">{pn?.nearestStrikeKm != null ? `${pn.nearestStrikeKm.toFixed(1)} ${t('km')}` : '—'}</span>
          </div>
          {status === 'safe' && <div className="mt-2 text-xs text-slate-400">{t('noStorm')}</div>}
        </motion.div>

        <div className="rounded-2xl border border-white/10 bg-ink-800/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Timer className="h-4 w-4 text-plasma" /> {t('rule3030')}
          </div>
          <p className="mt-1 text-xs text-slate-400">{t('rule3030Desc')}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="relative h-16 w-16">
              <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1e293b" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={sinceMin !== null && sinceMin < 30 ? '#ef4444' : '#22c55e'} strokeWidth="3" strokeDasharray={`${Math.min(1, (sinceMin ?? 30) / 30) * 97.4} 97.4`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 grid place-items-center font-mono text-sm font-bold text-white">{sinceMin !== null && sinceMin < 30 ? Math.ceil(30 - sinceMin) : '✓'}</div>
            </div>
            <div className="text-sm text-slate-300">
              {sinceMin !== null && sinceMin < 30 ? (
                <>
                  {t('lastThunder')}: <b className="font-mono text-white">{sinceMin.toFixed(0)} {t('min')}</b>. Stay inside for <b className="text-white">{Math.ceil(30 - sinceMin)} {t('min')}</b> more.
                </>
              ) : (
                <>No lightning within 10 km in the last 30 min.</>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-ink-800/70 p-4">
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
        </div>

        <div className="rounded-2xl border border-white/10 bg-ink-800/70 p-4">
          <div className="text-sm font-semibold text-white">{t('persona')}</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {PERSONAS.map(({ k, Icon }) => (
              <button key={k} onClick={() => setPersona(k)} className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] ${persona === k ? 'border-volt/60 bg-volt/15 text-white' : 'border-white/10 text-slate-400'}`}>
                <Icon className="h-5 w-5" />
                {t(k)}
              </button>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-black/20 p-3 text-sm leading-relaxed text-slate-200">{t(PERSONAS.find((x) => x.k === persona)!.adv)}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-ink-800/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Briefcase className="h-4 w-4 text-plasma" /> Commute planner
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-slate-400">{here?.name} →</span>
            <select value={there?.name} onChange={(e) => setDest(e.target.value)} className="flex-1 rounded-lg border border-white/10 bg-ink-900 px-2 py-1">
              {towns.filter((x) => x.name !== here?.name).map((x) => (
                <option key={x.name}>{x.name}</option>
              ))}
            </select>
          </div>
          {commute && (
            <div className={`mt-3 rounded-lg p-3 text-sm font-semibold ${commute.leaveNow ? 'bg-sev-green/15 text-sev-green' : 'bg-sev-orange/15 text-sev-orange'}`}>
              {commute.leaveNow ? t('leaveNow') : t('waitMin', { n: commute.wait })}
              <div className="mt-0.5 text-xs font-normal text-slate-400">
                {commute.d.toFixed(0)} km · ~{commute.travel} min by road · checked against every tracked storm path
              </div>
            </div>
          )}
        </div>

        <button onClick={share} className="btn btn-primary h-12 w-full text-base">
          <Share2 className="h-5 w-5" /> {t('share')}
        </button>
        <canvas ref={cardRef} width={1080} height={1080} className="hidden" />
        <div className="text-center text-[10px] text-slate-600">Prototype · simulated data · {fmtIST(sim)} IST</div>
      </div>
      <div className="fixed bottom-2 right-2 hidden text-[10px] text-slate-600 md:block">
        <span style={{ color: SEV_HEX[sev] }}>●</span> {snap.scenario.name}
      </div>
    </div>
  );
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
}
