import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Siren } from 'lucide-react';
import { useStore } from '../store';
import { Lightning } from './ui/lightning';

export function Toast() {
  const toast = useStore((s) => s.toast);
  const [show, setShow] = useState<typeof toast>(null);
  useEffect(() => {
    if (!toast) return;
    setShow(toast);
    const t = setTimeout(() => setShow(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const red = show?.severity === 'red';
  return (
    <div className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2">
      <AnimatePresence>
        {show && red && (
          <motion.div
            key={`flash-${show.id}`}
            className="pointer-events-none fixed inset-0 bg-plasma-soft mix-blend-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.14, 0.02, 0.1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, times: [0, 0.12, 0.3, 0.42, 1] }}
            aria-hidden
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {show && (
          <motion.div
            key={show.id}
            initial={{ y: -20, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={`pointer-events-auto flex max-w-[720px] items-center gap-3 overflow-hidden rounded-xl border px-4 py-2.5 shadow-2xl backdrop-blur ${red ? 'border-sev-red/60 bg-sev-red/20' : 'border-sev-orange/60 bg-sev-orange/15'}`}
          >
            {red && (
              <div className="pointer-events-none -my-2.5 -ml-4 h-12 w-10 shrink-0 mix-blend-screen">
                <Lightning hue={210} speed={2} intensity={0.7} size={1.4} />
              </div>
            )}
            <Siren className={`h-5 w-5 shrink-0 ${red ? 'text-sev-red' : 'text-sev-orange'}`} />
            <span className="text-sm font-semibold text-white">{show.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
