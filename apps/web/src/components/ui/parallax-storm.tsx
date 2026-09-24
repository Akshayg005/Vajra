import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Lightning } from './lightning';
import { ANVIL, CITY, CLOUDS_MID, FIELDS, FOG, HILLS_FAR, HILLS_NEAR, RAIN, SKY } from './storm-layers';

interface Layer {
  src: string;
  alt: string;
  /** mouse parallax strength */
  speedX: number;
  speedY: number;
  /** scroll parallax: px moved per 100 % scroll */
  scroll: number;
  z: number;
  className?: string;
}

const LAYERS: Layer[] = [
  { src: SKY, alt: '', speedX: 0.01, speedY: 0.01, scroll: 60, z: 1 },
  { src: ANVIL, alt: 'Cumulonimbus with anvil', speedX: 0.03, speedY: 0.02, scroll: 140, z: 3 },
  { src: HILLS_FAR, alt: '', speedX: 0.05, speedY: 0.02, scroll: 200, z: 5 },
  { src: CLOUDS_MID, alt: '', speedX: 0.08, speedY: 0.03, scroll: 260, z: 6, className: 'opacity-90' },
  { src: HILLS_NEAR, alt: '', speedX: 0.1, speedY: 0.03, scroll: 320, z: 7 },
  { src: CITY, alt: 'City skyline', speedX: 0.13, speedY: 0.04, scroll: 380, z: 8 },
  { src: FIELDS, alt: 'Paddy fields and palms', speedX: 0.18, speedY: 0.05, scroll: 460, z: 9 },
  { src: FOG, alt: '', speedX: 0.2, speedY: 0.05, scroll: 520, z: 10 },
];

/**
 * Parallax storm scene (adapted from the 21st.dev "Wilderness" parallax hero): hand-built SVG layers, mouse + scroll
 * parallax, WebGL lightning flickering behind the cloud bank and rain in front. Children render as the title block.
 */
export function ParallaxStorm({ children, className, container }: { children?: ReactNode; className?: string; container?: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { scrollYProgress } = useScroll({ target: ref, container: container as RefObject<HTMLElement> | undefined, offset: ['start start', 'end start'], layoutEffect: false });
  const titleY = useTransform(scrollYProgress, [0, 1], ['0%', '60%']);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let mx = 0;
    let my = 0;
    const apply = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const sp = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
      layerRefs.current.forEach((node, i) => {
        if (!node) return;
        const L = LAYERS[i];
        node.style.transform = `translate3d(${(-mx * L.speedX).toFixed(1)}px, ${(my * L.speedY + sp * L.scroll).toFixed(1)}px, 0)`;
      });
    };
    const onMove = (e: MouseEvent) => {
      mx = e.clientX - window.innerWidth / 2;
      my = e.clientY - window.innerHeight / 2;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('mousemove', onMove);
    const scroller = el.closest('.overflow-y-auto') ?? window;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    apply();
    return () => {
      window.removeEventListener('mousemove', onMove);
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={ref} className={cn('relative h-screen w-full overflow-hidden bg-ink-950', className)}>
      {LAYERS.map((L, i) => (
        <div
          key={i}
          ref={(n) => {
            layerRefs.current[i] = n;
          }}
          className={cn('pointer-events-none absolute -inset-x-[8%] -bottom-[6%] top-[-6%] transition-transform duration-500 ease-out will-change-transform', L.className)}
          style={{ zIndex: L.z }}
        >
          <img src={L.src} alt={L.alt} className="h-full w-full object-cover" draggable={false} />
        </div>
      ))}
      {/* lightning behind the mid cloud bank */}
      <div className="pointer-events-none absolute inset-y-0 left-[38%] w-[28%] opacity-80" style={{ zIndex: 4 }}>
        <Lightning hue={212} speed={1.3} intensity={0.55} size={1.8} />
      </div>
      <div className="pointer-events-none absolute inset-0 animate-rain opacity-60" style={{ zIndex: 11, backgroundImage: `url("${RAIN}")`, backgroundSize: '1200px 600px' }} />
      <div className="pointer-events-none absolute inset-0 z-[12] bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_55%,rgba(2,4,9,0.85))]" />
      <motion.div style={{ y: titleY, opacity: titleOpacity }} className="absolute inset-x-0 top-[16%] z-[13] px-6 text-center">
        {children}
      </motion.div>
    </section>
  );
}

export default ParallaxStorm;
