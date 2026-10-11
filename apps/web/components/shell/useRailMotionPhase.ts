'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { type RailMotionPhase, SHELL_RAIL_MOTION_MS } from './rail-motion';

/**
 * Resolve a rail's binary open state into the shared four-phase lifecycle
 * (`closed`/`opening`/`open`/`closing`) from `rail-motion.ts`.
 *
 * The phase flips to `opening`/`closing` synchronously on the render where
 * `open` changes — there is no dead interval between input and visible
 * response — then settles to `open`/`closed` after one cinematic duration.
 * A toggle mid-flight clears the pending settle and re-aims at the latest
 * requested state, so rapid open/close cycles cannot accumulate stale state.
 * Under prefers-reduced-motion the phase resolves directly to the final
 * state, matching `motion-reduce:transition-none`.
 */
export function useRailMotionPhase(open: boolean): RailMotionPhase {
  const prefersReducedMotion = useReducedMotion();
  const [transitioning, setTransitioning] = useState(false);

  // Render-time flip detection (the supported "adjust state during render"
  // pattern): a new input enters the moving phase on this same render and —
  // if another input lands mid-flight — re-aims without queuing or snapping.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setTransitioning(true);
  }

  useEffect(() => {
    if (!transitioning) return;
    if (prefersReducedMotion) {
      setTransitioning(false);
      return;
    }
    const timeout = globalThis.window.setTimeout(
      () => setTransitioning(false),
      SHELL_RAIL_MOTION_MS
    );
    return () => globalThis.window.clearTimeout(timeout);
  }, [transitioning, open, prefersReducedMotion]);

  if (prefersReducedMotion || !transitioning) {
    return open ? 'open' : 'closed';
  }
  return open ? 'opening' : 'closing';
}
