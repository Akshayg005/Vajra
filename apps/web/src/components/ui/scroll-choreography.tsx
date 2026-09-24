import { motion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { useRef, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

export interface ChoreoImage {
  src: string;
  alt: string;
  caption?: ReactNode;
}

interface ScrollChoreographyProps {
  className?: string;
  images: { topLeft: ChoreoImage; topRight: ChoreoImage; bottomLeft: ChoreoImage; bottomRight: ChoreoImage };
  /** text shown over the hero once it fills the screen */
  finale?: ReactNode;
  /** scroll container when the page does not scroll the window */
  container?: RefObject<HTMLElement | null>;
}

/**
 * Scroll Choreography (21st.dev): four panels swap diagonally, stack in the centre,
 * then the top-right panel expands to full screen. Images are local (offline).
 */
export function ScrollChoreography({ className, images, finale, container }: ScrollChoreographyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, container: container as RefObject<HTMLElement> | undefined, offset: ['start start', 'end end'], layoutEffect: false });
  const p = useSpring(scrollYProgress, { stiffness: 400, damping: 50, mass: 1.2, restDelta: 0.001 });

  const xLeft = '-20vw';
  const xRight = '20vw';
  const yTop = '-14vh';
  const yBottom = '14vh';
  const T = [0, 0.3, 0.35, 0.65, 1];

  const tlX = useTransform(p, T, [xLeft, xLeft, xLeft, '0vw', '0vw']);
  const tlY = useTransform(p, T, [yTop, yBottom, yBottom, '0vh', '0vh']);
  const brX = useTransform(p, T, [xRight, xRight, xRight, '0vw', '0vw']);
  const brY = useTransform(p, T, [yBottom, yTop, yTop, '0vh', '0vh']);
  const blX = useTransform(p, T, [xLeft, xLeft, xLeft, '0vw', '0vw']);
  const blY = useTransform(p, T, [yBottom, yBottom, yBottom, '0vh', '0vh']);
  const trX = useTransform(p, T, [xRight, xRight, xRight, '0vw', '0vw']);
  const trY = useTransform(p, T, [yTop, yTop, yTop, '0vh', '0vh']);
  const heroWidth = useTransform(p, [0.65, 0.7, 0.9, 1], ['36vw', '36vw', '100vw', '100vw']);
  const heroHeight = useTransform(p, [0.65, 0.7, 0.9, 1], ['24vh', '24vh', '100vh', '100vh']);
  const under = useTransform(p, [0.75, 0.85], [1, 0]);
  const captions = useTransform(p, [0, 0.25, 0.6, 0.7], [1, 1, 1, 0]);
  const finaleOpacity = useTransform(p, [0.88, 0.97], [0, 1]);

  const base = 'absolute left-1/2 top-1/2 w-[36vw] h-[24vh] overflow-hidden -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-ink-800 shadow-storm will-change-transform';

  const Panel = ({ img, x, y, z, fade }: { img: ChoreoImage; x: MotionValue<string>; y: MotionValue<string>; z: string; fade?: boolean }) => (
    <motion.div style={{ x, y, opacity: fade ? under : 1 }} className={cn(base, z)}>
      <img src={img.src} alt={img.alt} className="h-full w-full object-cover" loading="lazy" />
      {img.caption && (
        <motion.div style={{ opacity: captions }} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-sm font-semibold text-white">
          {img.caption}
        </motion.div>
      )}
    </motion.div>
  );

  return (
    <div ref={containerRef} className={cn('relative h-[300vh] w-full', className)}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <Panel img={images.topLeft} x={tlX} y={tlY} z="z-10" fade />
          <Panel img={images.bottomRight} x={brX} y={brY} z="z-20" fade />
          <Panel img={images.bottomLeft} x={blX} y={blY} z="z-30" fade />
          <motion.div style={{ x: trX, y: trY, width: heroWidth, height: heroHeight }} className={cn(base, 'z-40 origin-center')}>
            <img src={images.topRight.src} alt={images.topRight.alt} className="h-full w-full object-cover" loading="lazy" />
            {images.topRight.caption && (
              <motion.div style={{ opacity: captions }} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-sm font-semibold text-white">
                {images.topRight.caption}
              </motion.div>
            )}
            {finale && (
              <motion.div style={{ opacity: finaleOpacity }} className="absolute inset-0 grid place-items-center bg-gradient-to-t from-ink-950/90 via-ink-950/40 to-transparent">
                {finale}
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default ScrollChoreography;
