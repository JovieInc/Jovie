/**
 * UI-feel animation primitives — the shared vocabulary for micro-interactions.
 *
 * Three rules govern every interactive animation in the app:
 *
 * 1. **Interruptible over one-shot.** Interactive state changes (hover, toggle,
 *    icon swaps, selection) must use CSS transitions or motion springs so a
 *    mid-flight change retargets smoothly instead of snapping. Reserve
 *    `@keyframes` for one-shot staged sequences (entrance choreography,
 *    celebratory moments) that never need to reverse mid-play.
 *
 * 2. **Stagger enters, soften exits.** Split entrances into semantic chunks
 *    (~100ms delay each) so the eye reads structure. Exits use a smaller fixed
 *    translateY and a shorter duration — leaving should always feel softer
 *    than arriving.
 *
 * 3. **Depth from shadows, not borders.** Layered transparent box-shadows
 *    (a hairline ring + a tight contact shadow + a soft ambient shadow) read
 *    as physical depth; hard 1px borders read as wireframe. Prefer
 *    `SHADOW_LAYERED_DEPTH` (or the existing `shadow-card` token) over adding
 *    another border.
 *
 * **Optical alignment:** center glyphs by their visual mass, not their
 * bounding box. Directional icons (play, send, chevrons) need a ~0.5–1px
 * `transform` nudge toward their visual center — nudge with `translate`,
 * never with margin (margin shifts layout; transform doesn't).
 *
 * Sibling module: `components/jovie/components/chat-motion.ts` holds the
 * chat-composer surface-morph tokens. This module is the app-wide layer.
 */

import type { Transition, Variants } from 'motion/react';

// ─────────────────────────────────────────────────────────────────────────────
// Easing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emphasized-decelerate curve — fast start, long soft landing.
 * The canonical curve for cross-fades and state swaps.
 */
export const EASE_EMPHASIZED = [0.2, 0, 0, 1] as const;

/** CSS string form of {@link EASE_EMPHASIZED} for non-motion components. */
export const EASE_EMPHASIZED_CSS = 'cubic-bezier(0.2, 0, 0, 1)';

// ─────────────────────────────────────────────────────────────────────────────
// Icon / state swaps (contextual icon morphs: copy→check, menu→x, send→stop)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Icon-swap spring: 300ms perceptual duration, zero bounce.
 * Springs are interruptible by construction — a swap that reverses mid-flight
 * retargets from its current velocity instead of jumping.
 */
export const ICON_SWAP_TRANSITION: Transition = {
  type: 'spring',
  duration: 0.3,
  bounce: 0,
};

/**
 * Icon-swap variants: opacity 0→1, scale 0.25→1, blur 4px→0.
 * The blur sells the morph — the outgoing glyph dissolves rather than shrinks.
 */
export const ICON_SWAP_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.25, filter: 'blur(4px)' },
  visible: { opacity: 1, scale: 1, filter: 'blur(0px)' },
};

/** Reduced-motion icon swap: opacity-only, no scale or blur. */
export const ICON_SWAP_VARIANTS_REDUCED: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

/**
 * CSS fallback for components that can't take the motion dependency:
 * keep BOTH icons mounted (one absolutely positioned), toggle
 * opacity/transform per state, and transition with the emphasized curve.
 * Interruptible because CSS transitions always retarget from current value.
 *
 * @example
 * ```tsx
 * <span className='relative size-5'>
 *   <Menu className={cn('absolute inset-0', ICON_SWAP_CSS_CLASS,
 *     open ? 'opacity-0 scale-50' : 'opacity-100 scale-100')} />
 *   <X className={cn('absolute inset-0', ICON_SWAP_CSS_CLASS,
 *     open ? 'opacity-100 scale-100' : 'opacity-0 scale-50')} />
 * </span>
 * ```
 */
export const ICON_SWAP_CSS_CLASS =
  'transition-[opacity,transform] duration-normal ease-[cubic-bezier(0.2,0,0,1)]';

// ─────────────────────────────────────────────────────────────────────────────
// Staggered enter / exit
// ─────────────────────────────────────────────────────────────────────────────

/** Delay between semantic chunks in a staggered entrance. */
export const STAGGER_STEP_SECONDS = 0.1;

/**
 * Container variants for a staggered group. Apply to the parent
 * `motion` element; children use {@link STAGGER_ITEM_VARIANTS}.
 */
export function staggerContainerVariants(delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: STAGGER_STEP_SECONDS, delayChildren },
    },
    exit: {
      transition: {
        staggerChildren: STAGGER_STEP_SECONDS / 2,
        staggerDirection: -1,
      },
    },
  };
}

/**
 * Item variants for staggered children. Enter rises 8px on a spring;
 * exit drops a smaller fixed 4px on a fast fade — softer than the enter.
 */
export const STAGGER_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', duration: 0.35, bounce: 0 },
  },
  exit: {
    opacity: 0,
    y: 4,
    transition: { duration: 0.15, ease: EASE_EMPHASIZED },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Depth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Layered transparent box-shadow that reads as depth without a hard border:
 * hairline ring (edge definition) + contact shadow (grounding) + ambient
 * shadow (elevation). Use where `shadow-card` is too heavy or unavailable.
 */
export const SHADOW_LAYERED_DEPTH =
  '0 0 0 1px oklch(100% 0 0 / 0.06), 0 1px 2px oklch(0% 0 0 / 0.24), 0 4px 12px oklch(0% 0 0 / 0.16)';
