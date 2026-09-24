import { useEffect, useRef, useState } from 'react';

/** Eases numeric changes (no flicker): 400 ms ease-out between successive values. */
export function AnimatedNumber({
  value,
  decimals = 0,
  className,
  suffix = '',
  format,
}: {
  value: number;
  decimals?: number;
  className?: string;
  suffix?: string;
  format?: (v: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const start = useRef(0);
  const target = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    from.current = shown;
    target.current = value;
    start.current = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - start.current) / 400);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(from.current + (target.current - from.current) * e);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const txt = format ? format(shown) : Number.isFinite(shown) ? shown.toFixed(decimals) : '—';
  return (
    <span className={`tnum ${className ?? ''}`}>
      {txt}
      {suffix}
    </span>
  );
}
