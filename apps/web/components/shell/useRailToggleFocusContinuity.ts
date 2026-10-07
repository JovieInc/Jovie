'use client';
import { useEffect, useRef } from 'react';
import { isAvailable } from './useRailFocusReturn';

/** A logical browser toggle can move between header and rail on pinning.
 * Restore only its own disappearing focus, never a live route/editor. */
export function useRailToggleFocusContinuity(
  side: 'left' | 'right',
  pinned: boolean
) {
  const owner = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const track = (event: FocusEvent) => {
      owner.current =
        event.target instanceof HTMLElement &&
        event.target.matches(`[data-rail-toggle="${side}"]`)
          ? event.target
          : null;
    };
    document.addEventListener('focusin', track);
    return () => document.removeEventListener('focusin', track);
  }, [side]);
  useEffect(() => {
    const active = document.activeElement;
    if (
      !owner.current ||
      (isAvailable(owner.current) && active === owner.current)
    )
      return;
    if (
      active !== document.body &&
      active !== document.documentElement &&
      active?.isConnected
    )
      return;
    const target = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-rail-toggle="${side}"]`)
    ).find(isAvailable);
    target?.focus({ preventScroll: true });
  }, [side, pinned]);
}
