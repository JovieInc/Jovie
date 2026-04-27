/**
 * Shared motion tokens for the chat composer (variant F morphing surface).
 *
 * The composer morphs across four states (empty / typing / root / entity).
 * One easing + duration governs every transition so the surface always feels
 * like one connected object rather than a stack of independent boxes.
 */

import type { Transition } from 'motion/react';

/**
 * Variant F easing — a tuned, decelerated cubic that lands hard at the end.
 * Mirrors Apple's UIView animation curve and matches the mockup's CSS.
 */
export const EASE_SURFACE = [0.32, 0.72, 0, 1] as const;

/** DESIGN.md standard easing for non-surface micro-interactions. */
export const EASE_INTERACTIVE = [0.25, 0.46, 0.45, 0.94] as const;

/** Surface morph: 320ms with the variant F curve. Width, radius, layout. */
export const TRANSITION_SURFACE: Transition = {
  duration: 0.32,
  ease: EASE_SURFACE,
};

/** Spring config for textarea height — physical, no overshoot. */
export const SPRING_HEIGHT: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
  mass: 0.8,
};

/** 100ms cross-fade for icon morphs (send → stop, etc). */
export const TRANSITION_FAST: Transition = {
  duration: 0.1,
  ease: EASE_INTERACTIVE,
};

/** 150ms reveal for footer / chip-tray accordion-style sections. */
export const TRANSITION_REVEAL: Transition = {
  duration: 0.15,
  ease: EASE_INTERACTIVE,
};
