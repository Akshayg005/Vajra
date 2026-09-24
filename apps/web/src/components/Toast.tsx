import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Siren } from 'lucide-react';
import { useStore } from '../store';

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
        {show && (
          <motion.div
            key={show.id}
            initial={{ y: -20, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={`pointer-events-auto flex max-w-[720px] items-center gap-3 rounded-xl border px-4 py-2.5 shadow-2xl backdrop-blur ${red ? 'border-sev-red/60 bg-sev-red/20' : 'border-sev-orange/60 bg-sev-orange/15'}`}
          >
            <Siren className={`h-5 w-5 shrink-0 ${red ? 'text-sev-red' : 'text-sev-orange'}`} />
            <span className="text-sm font-semibold text-white">{show.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
