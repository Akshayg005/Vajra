import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Mic, MicOff, Send, Volume2, User } from 'lucide-react';
import type { PointNowcast, Severity, WorldSnapshot } from '@vajra/contracts';
import { useStore } from '../store';
import { LANGS } from '../i18n';
import { ADVISORY, answerPoint, detectLang, hazardProb, parse, type Lang } from '../lib/assistant';
import { AXIS, EChart } from '../components/EChart';
import { SEV_HEX, SEV_RANK, distanceKm } from '../lib/format';

interface Msg {
  id: number;
  role: 'user' | 'bot';
  text: string;
  lang?: Lang;
  map?: { place: { name: string; lng: number; lat: number }; cellId: string | null };
  chart?: { name: string; points: [number, number][] };
}

const SUGGEST = ['Will lightning hit Patna in the next hour?', 'कोलकाता में अगले 2 घंटे में आंधी आएगी?', 'Which storm is the most dangerous right now?', 'Advisory for farmers', 'Aviation advisory for Kolkata airport', 'বর্ধমানে কি বাজ পড়বে?', 'Summary of the situation'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export default function Assistant() {
  const snap = useStore((s) => s.snap)!;
  const adapter = useStore((s) => s.adapter);
  const [lang, setLang] = useState<Lang>('en');
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: 'bot', text: 'Namaste! I answer from the live VAJRA engine. Ask about a place, a time window and a hazard — in English, हिन्दी, मराठी, বাংলা, ଓଡ଼ିଆ, தமிழ், తెలుగు or ಕನ್ನಡ.' }]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(true);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs]);

  const ask = async (q: string) => {
    const clean = q.replace(/[<>]/g, '').slice(0, 300).trim();
    if (!clean || !adapter) return;
    const L = detectLang(clean, lang);
    const id = Date.now();
    setMsgs((m) => [...m, { id, role: 'user', text: clean }]);
    const st = useStore.getState().snap as WorldSnapshot;
    const p = parse(clean, st);
    let reply: Msg = { id: id + 1, role: 'bot', text: '', lang: L };
    if (p.intent === 'point' && p.place) {
      const pn = (await adapter.pointNowcast(p.place.lat, p.place.lng, p.leadMin)) as PointNowcast;
      const cell = st.cells.find((c) => c.id === pn.nearestCellId);
      const prob = hazardProb(pn, p.hazard);
      let text = answerPoint(L, p.place.name, p.leadMin, p.hazard, prob, pn, cell);
      if (p.sector) text += '\n\n' + ADVISORY[p.sector](st, pn.severity);
      const leads = [15, 30, 45, 60, 90, 120, 150, 180];
      const pts: [number, number][] = [];
      for (const ld of leads) {
        const x = (await adapter.pointNowcast(p.place.lat, p.place.lng, ld)) as PointNowcast;
        pts.push([ld, Math.round(hazardProb(x, p.hazard) * 100)]);
      }
      reply = { ...reply, text, map: { place: p.place, cellId: pn.nearestCellId }, chart: { name: `P(${p.hazard}) at ${p.place.name}`, points: pts } };
    } else if (p.intent === 'worst') {
      const c = [...st.cells].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.maxDbz - a.maxDbz)[0];
      reply.text = c
        ? `The most dangerous storm is ${c.id} (${c.type}, ${c.severity.toUpperCase()}): ${c.maxDbz.toFixed(0)} dBZ, echo top ${c.echoTopKm.toFixed(1)} km, ${c.flashRate.toFixed(0)} flashes/min${c.lightningJump ? ', LIGHTNING JUMP detected' : ''}${c.hail ? ', hail likely' : ''}. Moving ${Math.round(c.headingDeg)}° at ${Math.round(c.speedKmh)} km/h. ${c.xai.reason}`
        : 'No significant storms right now.';
      if (c) reply.map = { place: { name: c.id, lng: c.lng, lat: c.lat }, cellId: c.id };
    } else if (p.intent === 'advisory' && p.sector) {
      const worst = st.alerts.filter((a) => a.status !== 'expired').reduce<Severity>((w, a) => (SEV_RANK[a.severity] > SEV_RANK[w] ? a.severity : w), 'green');
      reply.text = ADVISORY[p.sector](st, worst);
    } else if (p.intent === 'help') {
      reply.text = 'Try: "Will lightning hit Patna in the next hour?", "Hail risk in Nagpur in 2 hours", "Advisory for fishers", or "Which storm is worst?".';
    } else {
      const live = st.alerts.filter((a) => a.status !== 'expired');
      reply.text = `${st.scenario.region}: ${st.cells.length} storm cells tracked, ${st.stats.strikesLastMin} strikes in the last minute, ${live.length} live warnings (${live.filter((a) => a.severity === 'red').length} red, ${live.filter((a) => a.severity === 'orange').length} orange). Regime: ${st.regime.label} (${Math.round(st.regime.confidence * 100)}% confidence).`;
    }
    // optional LLM polish through the API proxy (key never in the browser); silently skipped offline
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch('/api/v1/assistant', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: clean, draft: reply.text, lang: L }) });
      clearTimeout(to);
      if (r.ok) {
        const j = await r.json();
        if (j?.answer && j.source === 'llm') reply.text = j.answer;
      }
    } catch {
      /* offline: keep the engine-grounded answer */
    }
    setMsgs((m) => [...m, reply]);
    if (speak && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(reply.text.split('\n')[0]);
      u.lang = LANGS.find((x) => x.code === L)?.speech ?? 'en-IN';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  };

  const toggleMic = () => {
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = LANGS.find((x) => x.code === lang)?.speech ?? 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e: { results: { 0: { transcript: string } }[] }) => {
      const t = e.results[0][0].transcript;
      setInput(t);
      ask(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className="grid h-full grid-cols-[1fr_340px] gap-3 overflow-hidden p-3">
      <div className="panel flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-white/5 p-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-volt" />
            <span className="font-semibold text-white">VAJRA Assistant</span>
            <span className="chip">grounded in live engine state</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-sm">
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button className={`btn h-8 px-2 ${speak ? 'text-volt' : ''}`} onClick={() => setSpeak(!speak)} title="Read answers aloud">
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {msgs.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'bot' && <Bot className="mt-1 h-5 w-5 shrink-0 text-volt" />}
              <div className={`max-w-[760px] rounded-xl px-3 py-2 text-[14px] leading-relaxed ${m.role === 'user' ? 'bg-volt/15 text-white' : 'bg-white/[0.04] text-slate-100'}`}>
                <div className="whitespace-pre-wrap">{m.text}</div>
                {(m.map || m.chart) && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {m.map && <MiniMap snap={snap} place={m.map.place} cellId={m.map.cellId} />}
                    {m.chart && (
                      <div className="rounded-lg bg-ink-950/60 p-2">
                        <div className="text-[11px] text-slate-400">{m.chart.name} vs lead time</div>
                        <EChart
                          height={150}
                          option={{
                            grid: { left: 34, right: 8, top: 10, bottom: 22 },
                            xAxis: { type: 'value', min: 15, max: 180, ...AXIS },
                            yAxis: { type: 'value', min: 0, max: 100, ...AXIS },
                            series: [{ type: 'line', smooth: true, data: m.chart.points, areaStyle: { color: 'rgba(34,211,238,0.15)' }, lineStyle: { color: '#22d3ee', width: 2 }, itemStyle: { color: '#22d3ee' } }],
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              {m.role === 'user' && <User className="mt-1 h-5 w-5 shrink-0 text-slate-400" />}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="border-t border-white/5 p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {SUGGEST.map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-slate-300 hover:border-volt/50 hover:text-white">
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
              setInput('');
            }}
          >
            <button type="button" onClick={toggleMic} disabled={!SR} title={SR ? 'Voice input' : 'Voice input is not supported in this browser — please type'} className={`btn h-10 w-10 p-0 ${listening ? 'border-sev-red text-sev-red' : ''}`}>
              {SR ? <Mic className={`h-4 w-4 ${listening ? 'animate-pulse' : ''}`} /> : <MicOff className="h-4 w-4" />}
            </button>
            <input value={input} maxLength={300} onChange={(e) => setInput(e.target.value)} placeholder={listening ? 'Listening…' : 'Ask about storms, lightning, hail or advisories…'} className="h-10 flex-1 rounded-lg border border-white/10 bg-ink-800 px-3 text-sm outline-none focus:border-volt/60" />
            <button type="submit" className="btn btn-primary h-10 px-4">
              <Send className="h-4 w-4" />
            </button>
          </form>
          {!SR && <div className="mt-1 text-[11px] text-slate-500">Voice input is not available in this browser (works in Chrome/Edge). Typing works everywhere.</div>}
        </div>
      </div>
      <SectorCards snap={snap} ask={ask} />
    </div>
  );
}

function SectorCards({ snap, ask }: { snap: WorldSnapshot; ask: (q: string) => void }) {
  const items = [
    { k: 'Farmers', q: 'Advisory for farmers', d: 'Field work, crops, cattle' },
    { k: 'Aviation', q: 'Aviation advisory', d: 'Echo tops, shear, hail near airports' },
    { k: 'Marine', q: 'Advisory for fishers and boats', d: 'Squalls, return-to-harbour' },
    { k: 'Urban', q: 'Urban commute advisory for the city', d: 'Waterlogging, hoardings, trees' },
  ];
  const worst = useMemo(() => [...snap.cells].sort((a, b) => b.maxDbz - a.maxDbz)[0], [snap.cells]);
  return (
    <div className="scroll-thin space-y-3 overflow-y-auto">
      <div className="panel p-3">
        <div className="panel-title mb-2">Sector advisories</div>
        <div className="space-y-2">
          {items.map((i) => (
            <button key={i.k} onClick={() => ask(i.q)} className="w-full rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-left hover:border-volt/40">
              <div className="text-sm font-semibold text-white">{i.k}</div>
              <div className="text-[11px] text-slate-400">{i.d}</div>
            </button>
          ))}
        </div>
      </div>
      {worst && (
        <div className="panel p-3 text-[12px] text-slate-300">
          <div className="panel-title mb-1">Context the assistant sees</div>
          {snap.cells.length} cells · {snap.stats.strikesLastMin} strikes/min · strongest {worst.id} {worst.maxDbz.toFixed(0)} dBZ · regime {snap.regime.label}
        </div>
      )}
    </div>
  );
}

function MiniMap({ snap, place, cellId }: { snap: WorldSnapshot; place: { name: string; lng: number; lat: number }; cellId: string | null }) {
  const [w, s, e, n] = snap.scenario.bbox;
  const W = 260;
  const H = 150;
  const x = (lng: number) => ((lng - w) / (e - w)) * W;
  const y = (lat: number) => ((n - lat) / (n - s)) * H;
  const c = snap.cells.find((q) => q.id === cellId);
  return (
    <div className="rounded-lg bg-ink-950/60 p-2">
      <div className="text-[11px] text-slate-400">
        {place.name}
        {c ? ` · ${c.id} ${distanceKm(c.lng, c.lat, place.lng, place.lat).toFixed(0)} km away` : ''}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mt-1 rounded bg-[#0b1426]">
        {snap.strikes.slice(-300).map((st) => (
          <circle key={st.id} cx={x(st.lng)} cy={y(st.lat)} r={0.9} fill={st.kind === 'CG' ? '#bafaff' : '#a78bfa'} opacity={0.6} />
        ))}
        {snap.cells.map((q) => (
          <g key={q.id}>
            <circle cx={x(q.lng)} cy={y(q.lat)} r={Math.max(3, q.radiusKm / 3)} fill="none" stroke={SEV_HEX[q.severity]} strokeWidth={q.id === cellId ? 2 : 1} />
            {q.forecastTrack.length > 3 && <line x1={x(q.lng)} y1={y(q.lat)} x2={x(q.forecastTrack[4].lng)} y2={y(q.forecastTrack[4].lat)} stroke="#a78bfa" strokeWidth={1} strokeDasharray="2 2" />}
          </g>
        ))}
        <circle cx={x(place.lng)} cy={y(place.lat)} r={4} fill="#22d3ee" stroke="#fff" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
