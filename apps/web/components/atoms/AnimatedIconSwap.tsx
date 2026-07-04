'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  ICON_SWAP_TRANSITION,
  ICON_SWAP_VARIANTS,
  ICON_SWAP_VARIANTS_REDUCED,
} from '@/lib/animation/motion-primitives';
import { cn } from '@/lib/utils';

/**
 * AnimatedIconSwap — shared contextual icon/state swap primitive.
 *
 * Cross-morphs between icon states (copy→check, menu→x, send→stop) with
 * opacity 0→1, scale 0.25→1, blur 4px→0 on an interruptible zero-bounce
 * spring (see `lib/animation/motion-primitives.ts`).
 *
 * - `initial={false}` skips the enter animation on first render — the icon
 *   is simply there; only state *changes* animate.
 * - `mode='popLayout'` pops the outgoing icon out of layout flow so the
 *   incoming one takes its slot immediately; the two cross-fade in place,
 *   and a mid-flight reversal retargets smoothly.
 * - Honors `prefers-reduced-motion` by dropping scale/blur (opacity-only).
 *
 * @example
 * ```tsx
 * <AnimatedIconSwap activeKey={copied ? 'check' : 'copy'}>
 *   {copied ? <Check className='h-3 w-3' /> : <Copy className='h-3 w-3' />}
 * </AnimatedIconSwap>
 * ```
 */
export function AnimatedIconSwap({
  activeKey,
  children,
  className,
}: {
  /** Identity of the current state. Changing it triggers the swap. */
  readonly activeKey: string;
  /** The icon (or small glyph cluster) for the current state. */
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const variants = reducedMotion
    ? ICON_SWAP_VARIANTS_REDUCED
    : ICON_SWAP_VARIANTS;

  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center',
        className
      )}
    >
      <AnimatePresence initial={false} mode='popLayout'>
        <motion.span
          key={activeKey}
          className='inline-flex items-center justify-center'
          variants={variants}
          initial='hidden'
          animate='visible'
          exit='hidden'
          transition={ICON_SWAP_TRANSITION}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
