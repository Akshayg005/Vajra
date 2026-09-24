import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { STORM_POSTER } from './storm-layers';

/**
 * Liquid Effect Animation (21st.dev) with rain on. The threejs-components module is bundled locally
 * (lazy chunk, no CDN) and the image is a locally generated storm poster, so it works offline.
 */
export function LiquidEffectAnimation({ className, image = STORM_POSTER, rain = true }: { className?: string; image?: string; rain?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let app: { dispose?: () => void } | null = null;
    // start only when scrolled into view: it is a heavy full-screen WebGL effect
    const io = new IntersectionObserver(
      async ([e]) => {
        if (!e.isIntersecting || app || disposed) return;
        io.disconnect();
        const mod = await import('threejs-components/build/backgrounds/liquid1.min.js');
        if (disposed) return;
        const a = mod.default(canvas);
        a.loadImage(image);
        a.liquidPlane.material.metalness = 0.75;
        a.liquidPlane.material.roughness = 0.25;
        a.liquidPlane.uniforms.displacementScale.value = 5;
        a.setRain(rain);
        app = a;
      },
      { rootMargin: '200px' },
    );
    io.observe(canvas);
    return () => {
      disposed = true;
      io.disconnect();
      app?.dispose?.();
    };
  }, [image, rain]);

  return (
    <div className={cn('absolute inset-0 h-full w-full touch-none overflow-hidden', className)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
    </div>
  );
}

export default LiquidEffectAnimation;
