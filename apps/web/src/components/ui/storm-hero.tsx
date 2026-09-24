import { lazy, Suspense, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Menu, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lightning } from './lightning';

const RealisticStorm = lazy(() => import('./realistic-storm'));

export interface HeroStat {
  name: string;
  value: string;
  position: string;
}

const NAV = [
  { to: '/', label: 'Command Center' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/storm3d', label: '3D Storm' },
  { to: '/verification', label: 'Verification' },
  { to: '/assistant', label: 'Assistant' },
];

/** Floating live stat (Hero Odyssey feature item, with an amber glow). */
function FeatureItem({ name, value, position }: HeroStat) {
  return (
    <div className={cn('group absolute z-10 transition-all duration-300 hover:scale-110', position)}>
      <div className="relative flex items-center gap-2">
        <div className="relative">
          <div className="h-2 w-2 rounded-full bg-volt group-hover:animate-pulse" />
          <div className="absolute -inset-1 rounded-full bg-volt/30 opacity-70 blur-sm transition-opacity duration-300 group-hover:opacity-100" />
        </div>
        <div className="relative text-white">
          <div className="font-mono text-base font-semibold tnum">{value}</div>
          <div className="text-sm text-white/70">{name}</div>
          <div className="absolute -inset-2 -z-10 rounded-lg bg-white/5 opacity-70 blur-md transition-opacity duration-300 group-hover:opacity-100" />
        </div>
      </div>
    </div>
  );
}

const container: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.25, delayChildren: 0.2 } } };
const item: Variants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: 'easeOut' } } };

/**
 * StormHero = Hero Odyssey (21st.dev) + WebGL lightning + the raymarched 3D cumulonimbus, in the storm palette.
 * The floating feature items show live engine numbers.
 */
export function StormHero({ stats, title, subtitle, blurb, cta, secondary, flashRate = 24, hue = 212 }: { stats: HeroStat[]; title: string; subtitle: string; blurb: string; cta: { to: string; label: string }; secondary?: { to: string; label: string }; flashRate?: number; hue?: number }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="relative w-full overflow-hidden bg-ink-950 text-white">
      <div className="relative z-20 mx-auto h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.nav initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }} className="mb-12 flex items-center justify-between rounded-full border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-volt/30 to-plasma/20">
              <Zap className="h-5 w-5 text-volt" strokeWidth={2.5} />
            </div>
            <span className="ml-2 text-lg font-black tracking-[0.25em]">VAJRA</span>
            <div className="ml-8 hidden items-center space-x-2 md:flex">
              {NAV.map((n, i) => (
                <Link key={n.to} to={n.to} className={cn('rounded-full px-4 py-2 text-sm transition-colors', i === 0 ? 'bg-white/10 hover:bg-white/15' : 'text-white/80 hover:text-white')}>
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <a href="#/public" target="_blank" rel="noreferrer" className="hidden rounded-full px-4 py-2 text-sm text-white/80 hover:text-white md:block">
              Citizen app
            </a>
            <Link to={cta.to} className="rounded-full bg-volt px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-volt-soft">
              Launch
            </Link>
            <button className="rounded-md p-2 md:hidden" onClick={() => setMenu(!menu)} aria-label="Menu">
              {menu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </motion.nav>
        {menu && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex flex-col items-center justify-center space-y-5 bg-black/95 text-lg backdrop-blur-lg md:hidden">
            <button className="absolute right-6 top-6 p-2" onClick={() => setMenu(false)} aria-label="Close menu">
              <X className="h-6 w-6" />
            </button>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMenu(false)} className="px-6 py-3">
                {n.label}
              </Link>
            ))}
          </motion.div>
        )}

        <motion.div variants={container} initial="hidden" animate="visible" className="pointer-events-none absolute inset-x-8 top-[60%] z-[200] hidden md:block">
          {stats.map((s) => (
            <motion.div key={s.name} variants={item}>
              <FeatureItem {...s} />
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={container} initial="hidden" animate="visible" className="relative z-30 mx-auto flex max-w-4xl flex-col items-center text-center">
          <motion.div variants={item} className="mb-6 flex items-center gap-2 rounded-full border border-volt/30 bg-volt/10 px-4 py-2 text-sm text-volt-soft backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sev-red" /> Live · SIH26072 · IMD / MoES
          </motion.div>
          <motion.h1 variants={item} className="mb-2 text-5xl font-light tracking-tight md:text-7xl">
            {title}
          </motion.h1>
          <motion.h2 variants={item} className="bg-gradient-to-r from-volt-soft via-white to-plasma-soft bg-clip-text pb-3 text-3xl font-light text-transparent md:text-5xl">
            {subtitle}
          </motion.h2>
          <motion.p variants={item} className="mb-9 max-w-2xl text-lg text-slate-300">
            {blurb}
          </motion.p>
          <motion.div variants={item} className="mt-[80px] flex flex-wrap items-center justify-center gap-3">
            <Link to={cta.to} className="rounded-full bg-volt px-8 py-3 text-base font-semibold text-ink-950 shadow-glow transition hover:scale-105 hover:bg-volt-soft">
              {cta.label}
            </Link>
            {secondary && (
              <Link to={secondary.to} className="rounded-full border border-white/15 bg-white/10 px-8 py-3 text-base backdrop-blur-sm transition hover:bg-white/20">
                {secondary.label}
              </Link>
            )}
          </motion.div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#0f1c33_0%,#04070d_60%)]" />
        <div className="absolute left-1/2 top-[58%] h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-volt/20 via-ember/10 to-plasma/10 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-full w-full -translate-x-1/2">
          <Lightning hue={hue} xOffset={0} speed={1.6} intensity={0.6} size={2} />
        </div>
        {/* the 3D storm replaces Odyssey's planet */}
        <div className="absolute left-1/2 top-[48%] z-10 h-[640px] w-[900px] max-w-[100vw] -translate-x-1/2">
          <Suspense fallback={null}>
            <RealisticStorm flashRate={flashRate} />
          </Suspense>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-ink-950 to-transparent" />
      </motion.div>
    </div>
  );
}

export default StormHero;
