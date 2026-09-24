import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

/** Scroll reveal: fades and lifts content in as it enters the viewport (once). */
export function Reveal({ className, delay = 0, y = 24, children, ...rest }: HTMLMotionProps<'div'> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export default Reveal;
