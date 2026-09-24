import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useStore } from './store';
import { chooseAdapter } from './data/adapters';
import { TopBar } from './components/TopBar';
import { NavRail } from './components/NavRail';
import { Toast } from './components/Toast';
import { DirectorPanel } from './components/DirectorPanel';
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

export default function App() {
  const setAdapter = useStore((s) => s.setAdapter);
  const ingest = useStore((s) => s.ingest);
  const introDone = useStore((s) => s.introDone);
  const snap = useStore((s) => s.snap);
  const loc = useLocation();
  const citizen = loc.pathname.startsWith('/citizen');

  useEffect(() => {
    let stopped = false;
    let adapter: Awaited<ReturnType<typeof chooseAdapter>> | null = null;
    const scenario = new URLSearchParams(location.search).get('scenario') ?? 'kolkata-kalbaisakhi';
    chooseAdapter().then(async (a) => {
      if (stopped) return;
      adapter = a;
      setAdapter(a);
      await a.start(scenario, (s) => ingest(s));
    });
    return () => {
      stopped = true;
      adapter?.stop();
    };
  }, [setAdapter, ingest]);

  // Director Mode: Shift+D (hidden presenter panel)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        useStore.getState().setDirector(!useStore.getState().directorOpen);
      }
      if (e.key === ' ' && !e.shiftKey && tag !== 'BUTTON') {
        e.preventDefault();
        const s = useStore.getState();
        s.setPlaying(!s.playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (citizen)
    return (
      <Suspense fallback={<Boot />}>
        {snap ? <CitizenView /> : <Boot />}
        <DirectorPanel />
      </Suspense>
    );

  return (
    <div className="flex h-full w-full flex-col bg-ink-950 text-slate-100">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="relative min-w-0 flex-1">
          {!snap ? (
            <Boot />
          ) : (
            <Suspense fallback={<Boot />}>
              <Routes>
                <Route path="/" element={<CommandCenter />} />
                <Route path="/alerts" element={<AlertCenter />} />
                <Route path="/verification" element={<VerificationLab />} />
                <Route path="/sensors" element={<SensorHealth />} />
                <Route path="/reports" element={<CitizenReports />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/storm3d" element={<Storm3D />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="*" element={<CommandCenter />} />
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
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-volt/20 border-t-volt" />
        <div className="font-mono text-xs tracking-widest">SPINNING UP ENGINE · 210 MIN HISTORY</div>
      </div>
    </div>
  );
}
