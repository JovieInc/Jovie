'use client';

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { cn } from '@/lib/utils';

// Animation constants
const SPRING_STIFFNESS = 500;
const SPRING_DAMPING = 30;
const VERTICAL_OFFSET = -8;
const OPACITY_DURATION_MULTIPLIER_OPEN = 0.7;
const OPACITY_DURATION_MULTIPLIER_COLLAPSED = 0.5;
const HEIGHT_DURATION_MULTIPLIER_COLLAPSED = 0.8;
const DELAY_MULTIPLIER_OPACITY = 1.2;
const DELAY_SPRING_Y = 0.05;
const DELAY_OPACITY_Y = 0.1;
const DELAY_HEIGHT_COLLAPSED = 0.05;

// Easing curves
const EASE_HEIGHT = [0.32, 0.72, 0.32, 0.98] as const;
const EASE_OPACITY = [0.32, 0, 0.67, 1] as const;

function buildContainerVariants(
  duration: number,
  delay: number,
  reduceMotion: boolean
): Variants {
  const d = reduceMotion ? 0 : duration;
  const dl = reduceMotion ? 0 : delay;

  return {
    open: {
      opacity: 1,
      height: 'auto',
      transition: {
        height: { duration: d, ease: EASE_HEIGHT, delay: dl },
        opacity: {
          duration: d * OPACITY_DURATION_MULTIPLIER_OPEN,
          ease: EASE_OPACITY,
          delay: dl * DELAY_MULTIPLIER_OPACITY,
        },
      },
    },
    collapsed: {
      opacity: 0,
      height: 0,
      transition: {
        height: {
          duration: d * HEIGHT_DURATION_MULTIPLIER_COLLAPSED,
          ease: EASE_HEIGHT,
          delay: reduceMotion ? 0 : DELAY_HEIGHT_COLLAPSED,
        },
        opacity: {
          duration: d * OPACITY_DURATION_MULTIPLIER_COLLAPSED,
          ease: EASE_OPACITY,
        },
      },
    },
  };
}

function buildContentVariants(
  duration: number,
  delay: number,
  reduceMotion: boolean
): Variants {
  const d = reduceMotion ? 0 : duration;
  const dl = reduceMotion ? 0 : delay;

  return {
    open: {
      y: 0,
      opacity: 1,
      transition: {
        y: {
          type: 'spring',
          stiffness: SPRING_STIFFNESS,
          damping: SPRING_DAMPING,
          delay: dl + (reduceMotion ? 0 : DELAY_SPRING_Y),
        },
        opacity: {
          duration: d * HEIGHT_DURATION_MULTIPLIER_COLLAPSED,
          ease: EASE_OPACITY,
          delay: dl + (reduceMotion ? 0 : DELAY_OPACITY_Y),
        },
      },
    },
    collapsed: {
      y: VERTICAL_OFFSET,
      opacity: 0,
      transition: {
        y: {
          type: 'spring',
          stiffness: SPRING_STIFFNESS,
          damping: SPRING_DAMPING,
        },
        opacity: {
          duration: d * OPACITY_DURATION_MULTIPLIER_COLLAPSED,
          ease: EASE_OPACITY,
        },
      },
    },
  };
}

interface AnimatedAccordionProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  /**
   * Optional delay before starting the animation (in seconds)
   * @default 0
   */
  delay?: number;
  /**
   * Optional duration for the animation (in seconds)
   * @default 0.3
   */
  duration?: number;
}

export function AnimatedAccordion({
  isOpen,
  children,
  className,
  delay = 0,
  duration = 0.3,
}: AnimatedAccordionProps) {
  const shouldReduceMotion = useReducedMotion();
  const reduceMotion = Boolean(shouldReduceMotion);

  const containerVariants = buildContainerVariants(duration, delay, reduceMotion);
  const contentVariants = buildContentVariants(duration, delay, reduceMotion);

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial='collapsed'
          animate='open'
          exit='collapsed'
          variants={reduceMotion ? undefined : containerVariants}
          className={cn('overflow-hidden', className)}
          style={reduceMotion ? { display: isOpen ? 'block' : 'none' } : undefined}
        >
          <motion.div
            variants={reduceMotion ? undefined : contentVariants}
            className='origin-top'
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
