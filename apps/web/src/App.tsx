import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useStore } from './store';
import { SimulationAdapter, apiHealth, chooseAdapter, type DataAdapter } from './data/adapters';
import { resolveSeed } from './lib/seed';
import { TopBar } from './components/TopBar';
import { NavRail } from './components/NavRail';
import { Toast } from './components/Toast';
import { DirectorPanel } from './components/DirectorPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import CommandCenter from './pages/CommandCenter';

const AlertCenter = lazy(() => import('./pages/AlertCenter'));
const VerificationLab = lazy(() => import('./pages/VerificationLab'));
const SensorHealth = lazy(() => import('./pages/SensorHealth'));
const CitizenReports = lazy(() => import('./pages/CitizenReports'));
const Assistant = lazy(() => import('./pages/Assistant'));
const CitizenView = lazy(() => import('./pages/CitizenView'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Storm3D = lazy(() => import('./pages/Storm3D'));
const Compare = lazy(() => import('./pages/Compare'));
const Intro = lazy(() => import('./components/Intro'));

const page = (name: string, el: ReactNode) => <ErrorBoundary name={name}>{el}</ErrorBoundary>;

export default function App() {
  const introDone = useStore((s) => s.introDone);
  const snap = useStore((s) => s.snap);
  const projector = useStore((s) => s.projector);
  const loc = useLocation();
  const citizen = loc.pathname.startsWith('/citizen') || loc.pathname.startsWith('/public');

  useEffect(() => {
    let stopped = false;
    let adapter: DataAdapter | null = null;
    const st = useStore.getState();
    const { seed, locked } = resolveSeed();
    st.setSeed(seed, locked);
    const scenarioId = new URLSearchParams(location.search).get('scenario') ?? 'kolkata-kalbaisakhi';
    const onSnap = (s: Parameters<typeof st.ingest>[0]) => useStore.getState().ingest(s);
    const startLocal = async (why: 'local' | 'api-lost' | 'worker-restarted') => {
      const local = new SimulationAdapter();
      adapter = local;
      useStore.getState().setAdapter(local);
      useStore.getState().setSource(why);
      await local.start({ scenarioId: useStore.getState().snap?.scenario.id ?? scenarioId, seed, locked, speed: useStore.getState().speed, paused: false }, onSnap, (s) => useStore.getState().setSource(s));
    };
    void chooseAdapter().then(async (a) => {
      if (stopped) return;
      adapter = a;
      useStore.getState().setAdapter(a);
      await a.start({ scenarioId, seed, locked, speed: 1, paused: false }, onSnap, (s) => {
        useStore.getState().setSource(s);
        // one data source per session: if the API world is lost we switch to the local engine, never mix them
        if (s === 'api-lost' && a.id === 'api') {
          a.stop();
          void startLocal('api-lost');
        }
      });
      useStore.getState().setSource(a.id === 'api' ? 'api' : 'local');
    });
    // optional API features (report store, alert log, LLM proxy): probe every 20 s, show a status chip
    const probe = async () => {
      const h = await apiHealth(1500);
      useStore.getState().setApi(!!h?.ok, !!h?.llm);
    };
    void probe();
    const iv = setInterval(probe, 20000);
    return () => {
      stopped = true;
      clearInterval(iv);
      adapter?.stop();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('projector', projector);
  }, [projector]);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useStore.getState();
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        s.setDirector(!s.directorOpen);
      } else if (e.key === ' ' && tag !== 'BUTTON') {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (!e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'p' || e.key === 'P')) {
        s.setProjector(!s.projector);
      } else if (e.key === 'Escape') {
        if (s.pickMode) s.setPickMode(null);
        else if (s.detail) s.openDetail(null);
        else if (s.directorOpen) s.setDirector(false);
      } else if (e.key === '1') s.setSpeed(1);
      else if (e.key === '5') s.setSpeed(5);
      else if (e.key === '2') s.setSpeed(20);
      else if (e.key === '[') s.setScrub(Math.max(-120, s.scrubMin - 15));
      else if (e.key === ']') s.setScrub(Math.min(180, s.scrubMin + 15));
      else if (e.key === '0') s.setScrub(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (citizen)
    return (
      <Suspense fallback={<Boot />}>
        {snap ? page('Citizen view', <CitizenView />) : <Boot />}
        <DirectorPanel />
      </Suspense>
    );

  return (
    <div className="flex h-full w-full flex-col bg-ink-950 text-slate-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-volt focus:px-3 focus:py-1 focus:text-ink-950">
        Skip to content
      </a>
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main id="main" className="relative min-w-0 flex-1">
          {!snap ? (
            <Boot />
          ) : (
            <Suspense fallback={<Boot />}>
              <Routes>
                <Route path="/" element={page('Command Center', <CommandCenter />)} />
                <Route path="/alerts" element={page('Alert Center', <AlertCenter />)} />
                <Route path="/verification" element={page('Verification Lab', <VerificationLab />)} />
                <Route path="/sensors" element={page('Sensor Health', <SensorHealth />)} />
                <Route path="/reports" element={page('Citizen Reports', <CitizenReports />)} />
                <Route path="/assistant" element={page('Assistant', <Assistant />)} />
                <Route path="/analytics" element={page('Analytics', <Analytics />)} />
                <Route path="/storm3d" element={page('3D Storm View', <Storm3D />)} />
                <Route path="/compare" element={page('Coarse-to-fine', <Compare />)} />
                <Route path="*" element={page('Command Center', <CommandCenter />)} />
              </Routes>
            </Suspense>
          )}
        </main>
      </div>
      <Toast />
      <DirectorPanel />
      <AnimatePresence>
        {!introDone && (
          <Suspense fallback={null}>
            <Intro key="intro" />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}

function Boot() {
  return (
    <div className="grid h-full w-full place-items-center grid-bg">
      <div className="flex w-[360px] flex-col items-center gap-3 text-slate-400">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-volt/20 border-t-volt" />
        <div className="font-mono text-xs tracking-widest">SPINNING UP ENGINE · 4 H OF RADAR HISTORY</div>
        <div className="w-full space-y-2">
          {[88, 72, 80].map((w) => (
            <div key={w} className="h-2 animate-pulse rounded bg-white/[0.06]" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
