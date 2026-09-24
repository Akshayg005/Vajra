import { lazy, Suspense, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Bell, Brain, Box, Gauge, MessageSquareText, Radar, ShieldCheck, Smartphone, Zap } from 'lucide-react';
import { useStore } from '../store';
import { StormHero } from '@/components/ui/storm-hero';
import { ParallaxStorm } from '@/components/ui/parallax-storm';
import { ScrollChoreography } from '@/components/ui/scroll-choreography';
import { SqueezeCarousel, type SqueezeSlide } from '@/components/ui/carousel-squeeze';
import { Lightning } from '@/components/ui/lightning';
import { Reveal } from '@/components/ui/reveal';
import { SCENARIOS } from '../engine/scenarios';
import { liveAlerts } from '../selectors';

const LiquidEffectAnimation = lazy(() => import('@/components/ui/liquid-effect-animation'));

const FEATURES = [
  { Icon: Radar, title: 'Radar + satellite + lightning fusion', text: 'DWR reflectivity, INSAT-3DR/3DS cloud tops, the lightning network, NWP and AWS feed one trust-weighted picture.' },
  { Icon: Zap, title: '2σ lightning-jump detector', text: 'Flags a storm whose flash rate surges beyond two standard deviations — typically 10-30 min before severe weather.' },
  { Icon: Brain, title: 'Explainable probabilities', text: 'Every P(thunderstorm) splits into factor contributions that add up exactly to the number on screen.' },
  { Icon: Bell, title: 'Impact-based warnings', text: 'IMD colour codes on panchayat-level polygons, CAP 1.2 feeds, SMS/WhatsApp/siren counters and an alert-fatigue guard.' },
  { Icon: Gauge, title: 'Honest verification', text: 'Forecasts are stored and scored later against the truth: POD, FAR, CSI, ETS, FSS, Brier and reliability.' },
  { Icon: ShieldCheck, title: 'Self-healing data', text: 'Spikes, frozen feeds, drift and dropouts are detected, excluded from fusion and re-admitted after probation.' },
];

const PIPE = ['DWR radar', 'INSAT-3DS', 'Lightning net', 'NWP', 'AWS', 'QC + fusion', 'AI nowcast', 'XAI', 'Warnings', 'Citizens'];

export default function Welcome() {
  const snap = useStore((s) => s.snap);
  const send = useStore((s) => s.send);
  const nav = useNavigate();
  const scroller = useRef<HTMLDivElement>(null);
  const pipeRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: pipeP } = useScroll({ target: pipeRef, container: scroller, offset: ['start 80%', 'end 40%'], layoutEffect: false });
  const pathLen = useTransform(pipeP, [0, 1], [0, 1]);

  const live = snap ? liveAlerts(snap) : [];
  const v30 = snap?.verification.scores.find((s) => s.method === 'vajra' && s.leadMin === 30);
  const strongest = snap ? [...snap.cells].sort((a, b) => b.flashRate - a.flashRate)[0] : undefined;
  const stats = [
    { name: 'storm cells tracked', value: `${snap?.stats.cells ?? '—'}`, position: 'left-0 top-10' },
    { name: 'strikes in the last minute', value: `${snap?.stats.strikesLastMin ?? '—'}`, position: 'left-[9%] top-44' },
    { name: 'live warnings', value: `${live.length}`, position: 'right-[9%] top-44' },
    { name: 'CSI at 30 min (verified)', value: v30 ? v30.csi.toFixed(2) : '—', position: 'right-0 top-10' },
  ];

  const slides: SqueezeSlide[] = useMemo(
    () =>
      SCENARIOS.map((s) => ({
        id: s.id,
        title: s.name,
        description: s.description,
        image: `/shots/scn-${s.id}.jpg`,
        imageAlt: `Radar view of the ${s.name} scenario`,
        overlay: <span className="text-sm font-semibold tracking-wide text-white">{s.region}</span>,
        action: 'Load this storm',
        onAction: () => {
          void send({ type: 'scenario', id: s.id });
          nav('/');
        },
      })),
    [send, nav],
  );

  return (
    <div ref={scroller} className="relative h-full overflow-y-auto overflow-x-hidden bg-ink-950 text-white scroll-thin">
      <StormHero
        stats={stats}
        title="VAJRA"
        subtitle="Nowcasting the storm before it strikes"
        blurb="AI thunderstorm & lightning nowcasting for India: 0-3 h forecasts on a 2 km grid, lightning-jump alerts, explainable probabilities and panchayat-level warnings."
        cta={{ to: '/', label: 'Enter Command Center' }}
        secondary={{ to: '/public', label: 'Citizen “Am I safe?”' }}
        flashRate={strongest?.flashRate ?? 20}
      />

      <ParallaxStorm container={scroller}>
        <h2 className="text-5xl font-black leading-[0.9] tracking-tight drop-shadow-[0_4px_30px_rgba(0,0,0,0.8)] md:text-8xl">
          When the sky turns,
          <br />
          <span className="bg-gradient-to-r from-volt-soft via-volt to-ember bg-clip-text text-transparent">VAJRA sees it first.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-200 drop-shadow">
          Kalbaisakhi squall lines, Bihar lightning outbreaks, monsoon cloudbursts — tracked cell by cell, flash by flash.
        </p>
      </ParallaxStorm>

      <section className="relative bg-ink-950">
        <Reveal className="mx-auto max-w-5xl px-6 pb-4 pt-20 text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-volt">One engine, every screen</div>
          <h3 className="mt-3 text-4xl font-light md:text-5xl">From radar echo to a farmer’s phone</h3>
        </Reveal>
        <ScrollChoreography
          container={scroller}
          images={{
            topLeft: { src: '/shots/alerts.jpg', alt: 'Alert Center', caption: 'Impact-based warnings · CAP 1.2' },
            topRight: { src: '/shots/command.jpg', alt: 'Command Center', caption: 'Live Command Center' },
            bottomLeft: { src: '/shots/verification.jpg', alt: 'Verification Lab', caption: 'Verified skill, not claims' },
            bottomRight: { src: '/shots/storm3d.jpg', alt: '3D storm', caption: '3D storm structure' },
          }}
          finale={
            <Link to="/" className="rounded-full bg-volt px-8 py-3 text-lg font-semibold text-ink-950 shadow-glow transition hover:scale-105">
              Open the live Command Center
            </Link>
          }
        />
      </section>

      <section className="relative overflow-hidden bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950 py-24">
        <div className="pointer-events-none absolute inset-y-0 right-[6%] w-[26%] opacity-50 mix-blend-screen [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
          <Lightning hue={38} speed={1.1} intensity={0.45} size={1.6} />
        </div>
        <div className="relative mx-auto max-w-6xl px-6">
          <Reveal className="mb-12 max-w-2xl">
            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-volt">What judges can click</div>
            <h3 className="mt-3 text-4xl font-light">Real nowcasting logic on a physics-guided simulation</h3>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.08} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-volt/40 hover:bg-white/[0.05]">
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-volt/10 blur-2xl transition group-hover:bg-volt/25" />
                <f.Icon className="h-7 w-7 text-volt" />
                <div className="mt-4 text-lg font-semibold">{f.title}</div>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-300">{f.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ink-950 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mb-10">
            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-volt">Six Indian storm scenarios</div>
            <h3 className="mt-3 text-4xl font-light">Pick a storm. The whole system follows.</h3>
          </Reveal>
          <SqueezeCarousel slides={slides} label="Storm scenarios" height={340} autoplay interval={6500} />
        </div>
      </section>

      <section ref={pipeRef} className="relative bg-gradient-to-b from-ink-950 to-ink-900 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mb-10 text-center">
            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-volt">How it works</div>
            <h3 className="mt-3 text-4xl font-light">Observation → fusion → AI → warning, every 5 minutes</h3>
          </Reveal>
          <div className="relative">
            <svg viewBox="0 0 1000 120" className="w-full" aria-hidden>
              <motion.path d="M20 60 C 180 10, 300 110, 460 60 S 760 10, 980 60" fill="none" stroke="url(#pipe)" strokeWidth="4" strokeLinecap="round" style={{ pathLength: pathLen }} />
              <defs>
                <linearGradient id="pipe" x1="0" x2="1">
                  <stop offset="0" stopColor="#5aa9ff" />
                  <stop offset=".6" stopColor="#f5a524" />
                  <stop offset="1" stopColor="#ff7a1a" />
                </linearGradient>
              </defs>
            </svg>
            <div className="mt-4 grid grid-cols-5 gap-3 md:grid-cols-10">
              {PIPE.map((p, i) => (
                <Reveal key={p} delay={i * 0.06} className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center text-sm">
                  {p}
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative h-[80vh] overflow-hidden bg-ink-950">
        <Suspense fallback={null}>
          <LiquidEffectAnimation />
        </Suspense>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-ink-950/70" />
        <Reveal className="relative z-10 mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-6 text-center">
          <Smartphone className="h-10 w-10 text-volt" />
          <h3 className="mt-4 text-4xl font-light md:text-6xl">When the rain hits the glass, the warning is already on the phone.</h3>
          <p className="mt-4 max-w-2xl text-lg text-slate-200">Risk dial, arrival countdown, 30-30 rule timer, nearest shelter and persona advice in eight Indian languages.</p>
          <a href="#/public" target="_blank" rel="noreferrer" className="pointer-events-auto mt-8 rounded-full border border-white/20 bg-white/10 px-8 py-3 backdrop-blur hover:bg-white/20">
            Open the citizen app
          </a>
        </Reveal>
      </section>

      <section className="relative overflow-hidden bg-ink-950 py-28">
        <div className="pointer-events-none absolute inset-0 opacity-50 mix-blend-screen">
          <Lightning hue={36} speed={1.8} intensity={0.5} size={2.2} />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#04070d_75%)]" />
        <Reveal className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <h3 className="text-4xl font-light drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] md:text-6xl">Ready for the next Nor’wester?</h3>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/" className="rounded-full bg-volt px-8 py-3 text-lg font-semibold text-ink-950 shadow-glow transition hover:scale-105">
              Enter Command Center
            </Link>
            <Link to="/storm3d" className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-8 py-3 text-lg backdrop-blur hover:bg-white/20">
              <Box className="h-5 w-5" /> 3D storm
            </Link>
            <Link to="/assistant" className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-8 py-3 text-lg backdrop-blur hover:bg-white/20">
              <MessageSquareText className="h-5 w-5" /> Ask VAJRA
            </Link>
          </div>
          <p className="mt-10 text-sm text-slate-500">Prototype on a physics-guided simulation engine · boundaries: Survey of India outline via DataMeet (CC BY 4.0)</p>
        </Reveal>
      </section>
    </div>
  );
}
