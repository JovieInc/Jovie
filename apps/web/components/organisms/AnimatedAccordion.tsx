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

  // Motion variants for the container
  const containerVariants: Variants = {
    open: {
      opacity: 1,
      height: 'auto',
      transition: {
        height: {
          duration: shouldReduceMotion ? 0 : duration,
          ease: [0.32, 0.72, 0.32, 0.98],
          delay: shouldReduceMotion ? 0 : delay,
        },
        opacity: {
          duration: shouldReduceMotion
            ? 0
            : duration * OPACITY_DURATION_MULTIPLIER_OPEN,
          ease: [0.32, 0, 0.67, 1],
          delay: shouldReduceMotion ? 0 : delay * DELAY_MULTIPLIER_OPACITY,
        },
      },
    },
    collapsed: {
      opacity: 0,
      height: 0,
      transition: {
        height: {
          duration: shouldReduceMotion
            ? 0
            : duration * HEIGHT_DURATION_MULTIPLIER_COLLAPSED,
          ease: [0.32, 0.72, 0.32, 0.98],
          delay: shouldReduceMotion ? 0 : DELAY_HEIGHT_COLLAPSED,
        },
        opacity: {
          duration: shouldReduceMotion
            ? 0
            : duration * OPACITY_DURATION_MULTIPLIER_COLLAPSED,
          ease: [0.32, 0, 0.67, 1],
        },
      },
    },
  };

  // Motion variants for the content
  const contentVariants: Variants = {
    open: {
      y: 0,
      opacity: 1,
      transition: {
        y: {
          type: 'spring',
          stiffness: SPRING_STIFFNESS,
          damping: SPRING_DAMPING,
          delay: shouldReduceMotion ? 0 : delay + DELAY_SPRING_Y,
        },
        opacity: {
          duration: shouldReduceMotion
            ? 0
            : duration * HEIGHT_DURATION_MULTIPLIER_COLLAPSED,
          ease: [0.32, 0, 0.67, 1],
          delay: shouldReduceMotion ? 0 : delay + DELAY_OPACITY_Y,
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
          duration: shouldReduceMotion
            ? 0
            : duration * OPACITY_DURATION_MULTIPLIER_COLLAPSED,
          ease: [0.32, 0, 0.67, 1],
        },
      },
    },
  };

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial='collapsed'
          animate='open'
          exit='collapsed'
          variants={shouldReduceMotion ? undefined : containerVariants}
          className={cn('overflow-hidden', className)}
          style={
            shouldReduceMotion
              ? { display: isOpen ? 'block' : 'none' }
              : undefined
          }
        >
          <motion.div
            variants={shouldReduceMotion ? undefined : contentVariants}
            className='origin-top'
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
