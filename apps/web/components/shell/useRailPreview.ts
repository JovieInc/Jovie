'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SHELL_RAIL_PREVIEW_GRACE_MS } from './rail-motion';

/** Transient access belongs to the rail owner, never its persisted pin bit.
 * Delegated events cover browser and native-titlebar affordances equally. */
export function useRailPreview({
  side,
  pinned,
  enabled,
  resetKey,
}: {
  side: 'left' | 'right';
  pinned: boolean;
  enabled: boolean;
  resetKey?: unknown;
}) {
  const [isPreview, setIsPreview] = useState(false);
  const [presentationMode, setPresentationMode] = useState<
    'preview' | 'pinned'
  >('pinned');
  const blocked = useRef(false);
  const pointerInside = useRef(false);
  const pointerPoint = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const dismissPreview = useCallback(() => {
    cancel();
    blocked.current = true;
    setIsPreview(false);
  }, [cancel]);

  useEffect(() => {
    cancel();
    setIsPreview(false);
    setPresentationMode('pinned');
    blocked.current = false;
  }, [cancel, resetKey, enabled]);

  const previousPinned = useRef(pinned);
  useEffect(() => {
    if (previousPinned.current && !pinned) dismissPreview();
    if (pinned) {
      setPresentationMode('pinned');
      cancel();
      setIsPreview(false);
    }
    previousPinned.current = pinned;
  }, [pinned, cancel, dismissPreview]);

  useEffect(() => {
    if (!enabled) return;
    const selector = `[data-rail-toggle="${side}"], [data-rail-preview-region="${side}"]`;
    const inside = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest(selector));
    const enter = (event: Event) => {
      if (!inside(event.target)) {
        // Fresh focus on a live outside control ends suppression even when
        // the rail did not own focus during the explicit close.
        if (
          event.type === 'focusin' &&
          event.target instanceof HTMLElement &&
          event.target !== document.body &&
          event.target !== document.documentElement
        )
          blocked.current = false;
        return;
      }
      if (event.type === 'pointerover') {
        pointerInside.current = true;
      }
      if (pinned) return;
      // An entity inspector already owns the right surface. Hover must not
      // reinterpret it as an unsolicited artist-profile preview.
      if (
        side === 'right' &&
        document.querySelector(
          '[data-testid="app-shell-right-rail"] [data-rail-phase][aria-hidden="false"]'
        ) &&
        !isPreview
      )
        return;
      cancel();
      if (!blocked.current) {
        setPresentationMode('preview');
        setIsPreview(true);
      }
    };
    const leave = (event: MouseEvent | FocusEvent) => {
      if (!inside(event.target) || inside(event.relatedTarget)) return;
      if (event.type === 'pointerout') pointerInside.current = false;
      if (pointerInside.current || inside(document.activeElement)) return;
      if (
        event.type === 'focusout' &&
        event.relatedTarget instanceof Element &&
        event.relatedTarget !== document.body &&
        event.relatedTarget !== document.documentElement
      )
        blocked.current = false;
      if (pinned || blocked.current) return;
      cancel();
      timer.current = setTimeout(() => {
        setIsPreview(false);
        timer.current = null;
      }, SHELL_RAIL_PREVIEW_GRACE_MS);
    };
    const move = (event: PointerEvent) => {
      const previous = pointerPoint.current;
      pointerPoint.current = { x: event.clientX, y: event.clientY };
      pointerInside.current = inside(event.target);
      // Layout-generated pointerover after a close is not new intent. Only
      // real pointer travel out of the old region unlocks hover again.
      if (
        !blocked.current ||
        (previous &&
          previous.x === event.clientX &&
          previous.y === event.clientY)
      )
        return;
      const oldTarget =
        previous && typeof document.elementFromPoint === 'function'
          ? document.elementFromPoint(previous.x, previous.y)
          : event.target;
      if (!inside(oldTarget)) {
        blocked.current = false;
        if (inside(event.target)) enter(event);
      }
    };
    const outside = (event: PointerEvent) => {
      if (isPreview && !inside(event.target)) {
        dismissPreview();
        if (!inside(document.activeElement)) blocked.current = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      // A dialog/menu that consumed Escape in capture owns this dismissal.
      if (event.key === 'Escape' && !event.defaultPrevented && isPreview) {
        event.preventDefault();
        dismissPreview();
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerover', enter);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusin', enter);
    document.addEventListener('focusout', leave);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      cancel();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerover', enter);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusin', enter);
      document.removeEventListener('focusout', leave);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [enabled, pinned, side, isPreview, cancel, dismissPreview]);

  return {
    isPreview: enabled && !pinned && isPreview,
    isFloating:
      enabled &&
      !pinned &&
      // Placement outlives visibility. Returning a closed preview to flow
      // can allocate its last border frame while CSS is still settling.
      // Pinning or a scope reset, rather than a timer, owns that transfer.
      presentationMode === 'preview',
    dismissPreview,
  };
}
