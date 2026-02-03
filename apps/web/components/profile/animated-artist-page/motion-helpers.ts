/**
 * Motion prop helpers for AnimatedArtistPage.
 * Reduces cognitive complexity by extracting repeated conditional motion logic.
 */

import type { Variants } from 'motion/react';

/**
 * Motion animation values for fade-up transitions.
 */
export interface FadeUpMotionProps {
  readonly initial: { opacity: number; y?: number };
  readonly animate: { opacity: number; y?: number };
  readonly transition: { duration: number };
}

/**
 * Get fade-up motion props, respecting reduced motion preference.
 */
export function getFadeUpMotionProps(
  prefersReducedMotion: boolean
): FadeUpMotionProps {
  if (prefersReducedMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 },
  };
}

/**
 * Get AnimatePresence wrapper motion props.
 */
export function getPageWrapperMotionProps(
  prefersReducedMotion: boolean,
  pageVariants: Variants | undefined
) {
  if (prefersReducedMotion) {
    return {
      variants: undefined,
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }
  return {
    variants: pageVariants,
    initial: 'initial' as const,
    animate: 'animate' as const,
    exit: 'exit' as const,
  };
}
