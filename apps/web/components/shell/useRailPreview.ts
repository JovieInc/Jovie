'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SHELL_RAIL_PREVIEW_GRACE_MS } from './rail-motion';
import { isAvailable } from './useRailFocusReturn';

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
  const explicit = useRef(false);
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
    explicit.current = false;
    setIsPreview(false);
  }, [cancel]);
  const openPreview = useCallback(() => {
    cancel();
    blocked.current = false;
    explicit.current = true;
    setPresentationMode('preview');
    setIsPreview(true);
  }, [cancel]);

  // Activation promotes hover access to explicit access. A slow pointer click
  // must not close the preview that its own pointer entry just opened.
  const togglePreview = useCallback(() => {
    if (isPreview && explicit.current) dismissPreview();
    else openPreview();
  }, [isPreview, dismissPreview, openPreview]);

  useEffect(() => {
    cancel();
    setIsPreview(false);
    setPresentationMode('pinned');
    blocked.current = false;
    explicit.current = false;
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
    const selector = `[data-rail-toggle="${side}"], [data-rail-preview-region="${side}"], [data-rail-owned-overlay="${side}"]`;
    const inside = (target: EventTarget | null, depth = 0): boolean => {
      if (!(target instanceof Element)) return false;
      if (target.closest(selector)) return true;
      if (depth >= 3) return false;
      // Radix menus label each portal with its real trigger. Follow that
      // ownership through submenu portals instead of treating all menus as rails.
      const menu = target.closest('[role="menu"][aria-labelledby]');
      return Boolean(
        menu
          ?.getAttribute('aria-labelledby')
          ?.split(' ')
          .some(id => inside(document.getElementById(id), depth + 1))
      );
    };
    const hasOwnedOverlay = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="menu"][data-state="open"], [data-rail-owned-overlay][data-state="open"], [data-rail-owned-overlay]:not([data-state])'
        )
      ).some(element => inside(element));
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
        if ((event as PointerEvent).pointerType === 'touch') return;
        pointerInside.current = true;
      }
      if (pinned) return;
      // Owned portals retain a preview; independent media cannot create one.
      if (
        !isPreview &&
        event.target instanceof Element &&
        !event.target.closest(
          `[data-rail-toggle="${side}"], [data-rail-preview-region="${side}"]`
        )
      )
        return;
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
        if (
          side === 'left' &&
          event.type === 'focusin' &&
          event.target instanceof Element &&
          event.target.closest('[data-rail-toggle="left"]')
        )
          return;
        const show = () => {
          setPresentationMode('preview');
          setIsPreview(true);
          timer.current = null;
        };
        if (side === 'left' && event.type === 'pointerover' && !isPreview) {
          timer.current = setTimeout(show, 160);
        } else show();
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
      if (pinned || blocked.current || explicit.current) return;
      cancel();
      timer.current = setTimeout(() => {
        if (inside(document.activeElement) || hasOwnedOverlay()) {
          timer.current = null;
          return;
        }
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
      if (hasOwnedOverlay()) return;
      // A dialog/menu that consumed Escape in capture owns this dismissal.
      if (event.key === 'Escape' && !event.defaultPrevented && isPreview) {
        event.preventDefault();
        dismissPreview();
        const trigger = Array.from(
          document.querySelectorAll<HTMLElement>(`[data-rail-toggle="${side}"]`)
        ).find(isAvailable);
        trigger?.focus({ preventScroll: true });
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
    openPreview,
    togglePreview,
  };
}
