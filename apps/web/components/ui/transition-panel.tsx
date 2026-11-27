'use client';

/**
 * Motion Primitives Transition Panel (MIT).
 * Source: https://github.com/ibelick/motion-primitives (transition-panel)
 * Adapted for Jovie: System B duration/ease tokens + prefers-reduced-motion.
 */

import {
  AnimatePresence,
  type MotionProps,
  motion,
  type Transition,
  type Variant,
} from 'motion/react';
import type { ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

export type TransitionPanelProps = {
  readonly children: ReactNode[];
  readonly className?: string;
  readonly transition?: Transition;
  readonly activeIndex: number;
  readonly variants?: {
    readonly enter: Variant;
    readonly center: Variant;
    readonly exit: Variant;
  };
  readonly 'data-testid'?: string;
} & MotionProps;

const MOTION_VARIANTS = {
  enter: { opacity: 0, y: 8, filter: 'blur(2px)' },
  center: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -8, filter: 'blur(2px)' },
} as const;

const REDUCED_MOTION_VARIANTS = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

/** Static fallback when prefers-reduced-motion is on: opacity only, no travel. */
const REDUCED_MOTION_TRANSITION: Transition = {
  duration: 0.15,
  ease: 'easeOut',
};

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 220,
  damping: 28,
  mass: 0.8,
};

export function TransitionPanel({
  children,
  className,
  transition,
  variants,
  activeIndex,
  'data-testid': testId,
  ...motionProps
}: TransitionPanelProps) {
  // Marker for ASR-039: prefers-reduced-motion must appear in this file.
  const prefersReducedMotion = useReducedMotion();
  const resolvedVariants =
    variants ??
    (prefersReducedMotion ? REDUCED_MOTION_VARIANTS : MOTION_VARIANTS);
  const resolvedTransition =
    transition ??
    (prefersReducedMotion ? REDUCED_MOTION_TRANSITION : DEFAULT_TRANSITION);

  return (
    <div className={cn('relative', className)} data-testid={testId}>
      <AnimatePresence
        initial={false}
        mode='popLayout'
        custom={motionProps.custom}
      >
        <motion.div
          key={activeIndex}
          variants={resolvedVariants}
          transition={resolvedTransition}
          initial='enter'
          animate='center'
          exit='exit'
          {...motionProps}
        >
          {children[activeIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
