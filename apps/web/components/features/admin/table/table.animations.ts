/**
 * Unified Admin Table Animations
 * All animations use ease-out timing for smooth, purposeful motion
 * Target 60fps by only animating transform and opacity
 */

// Easing function: cubic-bezier(0, 0, 0.2, 1) = ease-out
const EASE_OUT = [0, 0, 0.2, 1] as const;

// Row insertion - ease-out slide and fade
export const rowInsertAnimation = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: EASE_OUT },
} as const;

// Row deletion - ease-out fade and scale
export const rowDeleteAnimation = {
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.15, ease: EASE_OUT },
} as const;

// Row selection - instant feedback
export const rowSelectAnimation = {
  animate: { backgroundColor: 'var(--color-selected)' },
  transition: { duration: 0.1, ease: EASE_OUT },
} as const;

// Kanban card drag - visual feedback
export const kanbanCardDragAnimation = {
  dragging: {
    opacity: 0.7,
    scale: 1.02,
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
  },
  transition: { duration: 0.15, ease: EASE_OUT },
} as const;

// Kanban card drop - smooth column transition
export const kanbanCardDropAnimation = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: EASE_OUT },
} as const;

// View mode transition - fade between List and Board
export const viewModeTransition = {
  exit: { opacity: 0 },
  enter: { opacity: 1 },
  transition: { duration: 0.2, ease: EASE_OUT },
} as const;

// Group header fade - smart disappearing behavior
export const groupHeaderFadeAnimation = {
  fadeOut: { opacity: 0, y: -5 },
  fadeIn: { opacity: 1, y: 0 },
  transition: { duration: 0.15, ease: EASE_OUT },
} as const;

// Skeleton pulse - loading state
export const skeletonPulseAnimation = {
  animate: {
    opacity: [0.5, 0.8, 0.5],
  },
  transition: {
    duration: 1.5,
    ease: EASE_OUT,
    repeat: Infinity,
  },
} as const;

// Empty state fade in
export const emptyStateFadeAnimation = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE_OUT },
} as const;

// Context menu slide in
export const contextMenuSlideAnimation = {
  initial: { opacity: 0, scale: 0.95, y: -5 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: -5 },
  transition: { duration: 0.15, ease: EASE_OUT },
} as const;

// Submenu slide in (from right)
export const submenuSlideAnimation = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
  transition: { duration: 0.15, ease: EASE_OUT },
} as const;

// Toolbar slide down
export const toolbarSlideAnimation = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: EASE_OUT },
} as const;

// Helper: Check if user prefers reduced motion
export function prefersReducedMotion(): boolean {
  if (globalThis.window?.matchMedia === undefined) return false;
  return globalThis.window.matchMedia('(prefers-reduced-motion: reduce)')
    .matches;
}

// Helper: Apply animation only if motion is enabled
export function withMotion<T>(animation: T): T | Record<string, never> {
  return prefersReducedMotion() ? {} : animation;
}
