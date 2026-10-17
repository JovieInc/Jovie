'use client';

// @coverage-via apps/web/tests/components/organisms/RightDrawer.interaction.test.tsx

import { type RefObject, useEffect, useRef } from 'react';

export function isAvailable(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[inert], [aria-hidden="true"]'))
    return false;
  if ('disabled' in element && element.disabled) return false;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

/** Return focus only when this rail hides the focused control. Never steal
 * focus from a live route/editor or change scroll while yielding the rail. */
export function useRailFocusReturn(
  ref: RefObject<HTMLElement | null>,
  hidden: boolean,
  side: 'left' | 'right',
  preferredTargetRef?: RefObject<HTMLElement | null>
) {
  const ownedFocus = useRef(false);
  const wasHidden = useRef(hidden);

  useEffect(() => {
    const trackFocus = (event: FocusEvent) => {
      ownedFocus.current = Boolean(ref.current?.contains(event.target as Node));
    };
    document.addEventListener('focusin', trackFocus);
    return () => document.removeEventListener('focusin', trackFocus);
  }, [ref]);

  useEffect(() => {
    const closing = hidden && !wasHidden.current;
    wasHidden.current = hidden;
    const active = document.activeElement;
    if (
      !closing ||
      !(
        ref.current?.contains(active) ||
        (active === document.body && ownedFocus.current)
      )
    )
      return;

    // A mobile modal remembers its actual opener. A registered rail control
    // is the fallback when a desktop rail closes across a breakpoint.
    const preferred = preferredTargetRef?.current;
    const target =
      preferred && isAvailable(preferred)
        ? preferred
        : Array.from(
            document.querySelectorAll<HTMLElement>(
              `[data-rail-toggle="${side}"]`
            )
          ).find(isAvailable);
    target?.focus({ preventScroll: true });
    ownedFocus.current = false;
  }, [hidden, ref, side, preferredTargetRef]);
}
