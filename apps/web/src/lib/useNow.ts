import { useEffect, useState } from 'react';
import { useStore } from '../store';

/** Engine clock, interpolated between ticks so "x min ago" labels and countdowns tick live. */
export function useSimNow(intervalMs = 1000) {
  const simTime = useStore((s) => s.snap?.stats.simTime ?? 0);
  const speed = useStore((s) => s.speed);
  const playing = useStore((s) => s.playing);
  const receivedAt = useStore((s) => s.receivedAt);
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((x) => x + 1), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return playing ? simTime + Math.min(1000, performance.now() - receivedAt) * speed : simTime;
}

export function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ${m % 60} min ago`;
}
