'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SHELL_RAIL_PREVIEW_GRACE_MS } from './rail-motion';

// Radix places interactive overlays outside their trigger's DOM subtree. Follow
// open ARIA controls only, including submenu controls, rather than all portals.
function ownedRailOverlays(selector: string): Element[] {
  const roots = Array.from(document.querySelectorAll(selector));
  const owned = new Set<Element>();
  const controls = '[aria-expanded="true"][aria-controls]';
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index];
    const triggers = Array.from(root.querySelectorAll(controls));
    if (root.matches(controls)) triggers.push(root);
    for (const trigger of triggers) {
      for (const id of trigger.getAttribute('aria-controls')?.split(/\s+/) ??
        []) {
        const overlay = document.getElementById(id);
        if (
          !overlay ||
          owned.has(overlay) ||
          !overlay.matches(
            '[role="menu"], [role="dialog"], [role="listbox"], [role="tree"], [role="grid"]'
          ) ||
          overlay.closest(
            '[hidden], [aria-hidden="true"], [data-state="closed"]'
          )
        )
          continue;
        owned.add(overlay);
        roots.push(overlay);
      }
    }
  }
  return Array.from(owned);
}

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
  const pointerTarget = useRef<EventTarget | null>(null);
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
    const selector = `[data-rail-toggle="${side}"]:not([data-rail-preview-trigger="false"]), [data-rail-preview-region="${side}"]`;
    const inside = (target: EventTarget | null) =>
      target instanceof Element &&
      target.isConnected &&
      (Boolean(target.closest(selector)) ||
        ownedRailOverlays(selector).some(overlay => overlay.contains(target)));
    const retain = () =>
      pointerInside.current ||
      inside(document.activeElement) ||
      ownedRailOverlays(selector).length > 0;
    const scheduleLeave = () => {
      if (pinned || blocked.current || retain()) {
        cancel();
        return;
      }
      if (timer.current !== null) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!retain()) setIsPreview(false);
      }, SHELL_RAIL_PREVIEW_GRACE_MS);
    };
    const enter = (event: Event) => {
      if (event.type === 'pointerover') {
        pointerTarget.current = event.target;
        pointerInside.current = inside(event.target);
      }
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
      const wasInside = inside(event.target);
      if (event.type === 'pointerout') {
        pointerTarget.current = event.relatedTarget;
        pointerInside.current = inside(event.relatedTarget);
      }
      if (!wasInside || inside(event.relatedTarget)) return;
      if (retain()) return;
      if (
        event.type === 'focusout' &&
        event.relatedTarget instanceof Element &&
        event.relatedTarget !== document.body &&
        event.relatedTarget !== document.documentElement
      )
        blocked.current = false;
      scheduleLeave();
    };
    const move = (event: PointerEvent) => {
      const previous = pointerPoint.current;
      pointerPoint.current = { x: event.clientX, y: event.clientY };
      pointerTarget.current = event.target;
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
    const observer = new MutationObserver(() => {
      if (!isPreview) return;
      // A hovered portal may detach without delivering pointerout.
      pointerInside.current = inside(pointerTarget.current);
      scheduleLeave();
    });
    if (isPreview && !pinned)
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          'aria-expanded',
          'aria-controls',
          'aria-hidden',
          'hidden',
          'data-state',
          'id',
        ],
      });
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerover', enter);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusin', enter);
    document.addEventListener('focusout', leave);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      observer.disconnect();
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
