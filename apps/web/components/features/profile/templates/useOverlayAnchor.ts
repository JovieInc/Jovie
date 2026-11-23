'use client';

import { type RefObject, useMemo, useRef } from 'react';

/**
 * Desktop overlays (menu, Pay, Share, credits) open as a popover anchored to
 * whichever control opened them. `anchorRef.current` resolves lazily to the
 * last trigger, falling back to the Menu button.
 */
export function useOverlayAnchor(
  menuButtonRefProp?: RefObject<HTMLButtonElement | null>
) {
  const ownMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuButtonRef = menuButtonRefProp ?? ownMenuButtonRef;
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const anchorRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const trigger = lastTriggerRef.current;
        return trigger?.isConnected ? trigger : menuButtonRef.current;
      },
    }),
    [menuButtonRef]
  );
  return { menuButtonRef, anchorRef, lastTriggerRef };
}
