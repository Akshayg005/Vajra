import { useEffect, useRef, useState } from 'react';
import { Bot, Mic, MicOff, Send, Volume2, VolumeX, User } from 'lucide-react';
import type { PointNowcast, WorldSnapshot } from '@vajra/contracts';
import { useStore } from '../store';
import { LANGS } from '../i18n';
import { ADVISORY, answerPoint, detectLang, hazardProb, parse, type Lang } from '../lib/assistant';
import { SEV_RANK, liveAlerts, worstSeverity } from '../selectors';
import { AssistantOutSchema, ChatInputSchema } from '../data/schemas';
import { getRecognizer, speak, type SpeechRecognitionLike } from '../lib/speech';
import { ChartCard, MiniMap } from '../components/assistant/MessageCards';
import { inferenceDelay, wait } from '../components/Skeleton';
import { Lightning } from '../components/ui/lightning';

interface Msg {
  id: number;
  role: 'user' | 'bot';
  text: string;
  shown: number;
  map?: { place: { name: string; lng: number; lat: number }; cellId: string | null };
  chart?: { name: string; points: [number, number][] };
  source?: 'engine' | 'llm';
}

const SUGGEST = [
  'Will lightning hit Patna in the next hour?',
  'कोलकाता में अगले 2 घंटे में आंधी आएगी?',
  'Which storm is the most dangerous right now?',
  'Advisory for farmers',
  'Aviation advisory for Kolkata airport',
  'বর্ধমানে কি বাজ পড়বে?',
  'Hail risk in Nagpur in 90 minutes',
  'Summary of the situation',
];
let msgSeq = 1;

export default function Assistant() {
  const snap = useStore((s) => s.snap)!;
  const adapter = useStore((s) => s.adapter);
  const llmOnline = useStore((s) => s.llmOnline);
  const [lang, setLang] = useState<Lang>('en');
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 0,
      role: 'bot',
      text: 'Namaste! I answer from the live VAJRA engine. Ask about a place, a time window and a hazard — in English, हिन्दी, मराठी, বাংলা, ଓଡ଼ିଆ, தமிழ், తెలుగు or ಕನ್ನಡ.',
      shown: 999,
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const Recognizer = getRecognizer();
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, thinking]);

  // streaming reply effect: reveal ~3 characters per frame
  useEffect(() => {
    const m = msgs[msgs.length - 1];
    if (!m || m.role !== 'bot' || m.shown >= m.text.length) return;
    const r = requestAnimationFrame(() => setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, shown: x.shown + 3 } : x))));
    return () => cancelAnimationFrame(r);
  }, [msgs]);

  const ask = async (raw: string) => {
    const parsed = ChatInputSchema.safeParse(raw);
    if (!parsed.success || !adapter || thinking) return;
    const clean = parsed.data;
    const L = detectLang(clean, lang);
    setMsgs((m) => [...m, { id: msgSeq++, role: 'user', text: clean, shown: 999 }]);
    setThinking(true);
    await wait(inferenceDelay(clean));
    const st = useStore.getState().snap as WorldSnapshot;
    const p = parse(clean, st);
    let reply: Msg = { id: msgSeq++, role: 'bot', text: '', shown: 0, source: 'engine' };
    if (p.intent === 'point' && p.place) {
      const pn = (await adapter.pointNowcast(p.place.lat, p.place.lng, p.leadMin)) as PointNowcast;
      const cell = st.cells.find((c) => c.id === pn.nearestCellId);
      let text = answerPoint(L, p.place.name, p.leadMin, p.hazard, hazardProb(pn, p.hazard), pn, cell);
      if (p.sector) text += '\n\n' + ADVISORY[p.sector](st, pn.severity);
      const pts: [number, number][] = [];
      for (const ld of [15, 30, 45, 60, 90, 120, 150, 180]) {
        const x = (await adapter.pointNowcast(p.place.lat, p.place.lng, ld)) as PointNowcast;
        pts.push([ld, +(hazardProb(x, p.hazard) * 100).toFixed(1)]);
      }
      reply = { ...reply, text, map: { place: p.place, cellId: pn.nearestCellId }, chart: { name: `P(${p.hazard}) at ${p.place.name}`, points: pts } };
    } else if (p.intent === 'worst') {
      const c = [...st.cells].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.maxDbz - a.maxDbz)[0];
      reply.text = c
        ? `The most dangerous storm is ${c.id} (${c.type}, ${c.severity.toUpperCase()}): ${c.maxDbz.toFixed(1)} dBZ, echo top ${c.echoTopKm.toFixed(1)} km, ${c.flashRate.toFixed(1)} flashes/min${c.lightningJump ? `, LIGHTNING JUMP +${c.jumpSigma.toFixed(1)}σ` : ''}${c.hail ? ', hail likely' : ''}. Moving ${c.headingDeg.toFixed(0)}° at ${c.speedKmh.toFixed(1)} km/h. ${c.xai.reason}`
        : 'No significant storms right now.';
      if (c) reply.map = { place: { name: c.id, lng: c.lng, lat: c.lat }, cellId: c.id };
    } else if (p.intent === 'advisory' && p.sector) {
      reply.text = ADVISORY[p.sector](st, worstSeverity(liveAlerts(st)));
    } else if (p.intent === 'help') {
      reply.text = 'Try: "Will lightning hit Patna in the next hour?", "Hail risk in Nagpur in 2 hours", "Advisory for fishers", or "Which storm is worst?".';
    } else {
      const live = liveAlerts(st);
      reply.text = `${st.scenario.region}: ${st.cells.length} storm cells tracked, ${st.stats.strikesLastMin} strikes in the last minute, ${live.length} live warnings (${live.filter((a) => a.severity === 'red').length} red, ${live.filter((a) => a.severity === 'orange').length} orange, ${live.filter((a) => a.status === 'draft').length} drafts). Regime: ${st.regime.label} (${(st.regime.confidence * 100).toFixed(1)}% confidence).`;
    }
    // optional LLM rephrase through the API proxy (key stays server-side); skipped silently when offline
    if (llmOnline) {
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch('/api/v1/assistant', {
          method: 'POST',
          signal: ctl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: clean, draft: reply.text.slice(0, 2000), lang: L }),
        });
        clearTimeout(to);
        const j = AssistantOutSchema.safeParse(r.ok ? await r.json() : null);
        if (j.success && j.data.source === 'llm') reply = { ...reply, text: j.data.answer, source: 'llm' };
      } catch {
        /* keep the engine-grounded answer */
      }
    }
    setThinking(false);
    setMsgs((m) => [...m, reply]);
    if (voiceOut) speak(reply.text.split('\n')[0], LANGS.find((x) => x.code === L)?.speech ?? 'en-IN');
  };

  const toggleMic = () => {
    if (!Recognizer) return;
    if (listening) return recRef.current?.stop();
    const rec = new Recognizer();
    rec.lang = LANGS.find((x) => x.code === lang)?.speech ?? 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setInput(t);
      void ask(t);
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
        <div className="relative flex items-center justify-between overflow-hidden border-b border-white/5 p-3">
          <div className="pointer-events-none absolute inset-y-0 left-6 w-40 opacity-50 mix-blend-screen" aria-hidden>
            <Lightning hue={38} speed={1.2} intensity={0.45} size={1.4} />
          </div>
          <div className="relative flex items-center gap-2">
            <Bot className="h-5 w-5 text-volt" />
            <span className="font-semibold text-white">VAJRA Assistant</span>
            <span className="chip">grounded in live engine state{llmOnline ? ' · LLM phrasing on' : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-sm"
              aria-label="Answer language"
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button
              className={`btn h-8 px-2 ${voiceOut ? 'text-volt' : ''}`}
              onClick={() => setVoiceOut(!voiceOut)}
              title={voiceOut ? 'Voice replies on' : 'Voice replies off'}
              aria-pressed={voiceOut}
              aria-label="Read answers aloud"
            >
              {voiceOut ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {msgs.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'bot' && <Bot className="mt-1 h-5 w-5 shrink-0 text-volt" />}
              <div className={`max-w-[760px] rounded-xl px-3 py-2 text-[14px] leading-relaxed ${m.role === 'user' ? 'bg-volt/15 text-white' : 'bg-white/[0.04] text-slate-100'}`}>
                <div className="whitespace-pre-wrap">
                  {m.text.slice(0, m.shown)}
                  {m.shown < m.text.length && <span className="animate-pulse">▍</span>}
                </div>
                {m.shown >= m.text.length && (m.map || m.chart) && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {m.map && <MiniMap snap={snap} place={m.map.place} cellId={m.map.cellId} />}
                    {m.chart && <ChartCard name={m.chart.name} points={m.chart.points} />}
                  </div>
                )}
              </div>
              {m.role === 'user' && <User className="mt-1 h-5 w-5 shrink-0 text-slate-400" />}
            </div>
          ))}
          {thinking && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Bot className="h-5 w-5 text-volt" />
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-volt/70" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              querying live engine state…
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t border-white/5 p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {SUGGEST.map((s) => (
              <button
                key={s}
                onClick={() => void ask(s)}
                className="rounded-full border border-white/10 px-2.5 py-0.5 text-[12px] text-slate-300 hover:border-volt/50 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
              setInput('');
            }}
          >
            <button
              type="button"
              onClick={toggleMic}
              disabled={!Recognizer}
              title={Recognizer ? 'Voice input' : 'Voice input is not supported in this browser — please type'}
              aria-label="Voice input"
              className={`btn h-10 w-10 p-0 ${listening ? 'border-sev-red text-sev-red' : ''}`}
            >
              {Recognizer ? <Mic className={`h-4 w-4 ${listening ? 'animate-pulse' : ''}`} /> : <MicOff className="h-4 w-4" />}
            </button>
            <input
              value={input}
              maxLength={300}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? 'Listening…' : 'Ask about storms, lightning, hail or advisories…'}
              aria-label="Question"
              className="h-10 flex-1 rounded-lg border border-white/10 bg-ink-800 px-3 text-sm outline-none focus:border-volt/60"
            />
            <button type="submit" className="btn btn-primary h-10 px-4" aria-label="Send" disabled={thinking}>
              <Send className="h-4 w-4" />
            </button>
          </form>
          {!Recognizer && (
            <div className="mt-1 text-[12px] text-slate-400">
              Voice input is not available in this browser (works in Chrome and Edge). Typing works everywhere; answers can still be read aloud.
            </div>
          )}
        </div>
      </div>
      <SectorCards snap={snap} ask={(q) => void ask(q)} />
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
  const worst = [...snap.cells].sort((a, b) => b.maxDbz - a.maxDbz)[0];
  return (
    <div className="scroll-thin space-y-3 overflow-y-auto">
      <div className="panel p-3">
        <div className="panel-title mb-2">Sector advisories</div>
        <div className="space-y-2">
          {items.map((i) => (
            <button key={i.k} onClick={() => ask(i.q)} className="w-full rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-left hover:border-volt/40">
              <div className="text-sm font-semibold text-white">{i.k}</div>
              <div className="text-[12px] text-slate-400">{i.d}</div>
            </button>
          ))}
        </div>
      </div>
      {worst && (
        <div className="panel p-3 text-[12px] text-slate-300">
          <div className="panel-title mb-1">Context the assistant sees</div>
          {snap.cells.length} cells · {snap.stats.strikesLastMin} strikes/min · strongest {worst.id} {worst.maxDbz.toFixed(1)} dBZ · {liveAlerts(snap).length} live warnings ·
          regime {snap.regime.label}
        </div>
      )}
    </div>
  );
}
