export function Skeleton({ className = '', lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`space-y-2 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-white/[0.07]" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

/** Short "inference" delay (150-600 ms) derived from the input, so heavy actions feel computed, never instant or blank. */
export function inferenceDelay(key: string, min = 150, max = 600) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return min + (h % (max - min));
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
