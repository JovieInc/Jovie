'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SHELL_RAIL_PREVIEW_GRACE_MS } from './rail-motion';
import { isAvailable } from './useRailFocusReturn';

const RIGHT_SLOT = '[data-testid="app-shell-right-rail"]';
const RIGHT_PEEK =
  '[data-testid="app-shell-right-rail"] [data-rail-presentation="overlay"]';

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
  enterIntentMs = 0,
}: {
  side: 'left' | 'right';
  pinned: boolean;
  enabled: boolean;
  resetKey?: unknown;
  /** Hover-intent dwell before a pointer opens the preview. Focus and
   * keyboard open immediately; touch never opens it (no hover dependence). */
  enterIntentMs?: number;
}) {
  const [isPreview, setIsPreview] = useState(false);
  const [presentationMode, setPresentationMode] = useState<
    'preview' | 'pinned'
  >('pinned');
  const blocked = useRef(false);
  const pointerInside = useRef(false);
  const pointerTarget = useRef<EventTarget | null>(null);
  const pointerPoint = useRef<{ x: number; y: number } | null>(null);
  const pressedToggle = useRef<Element | null>(null);
  const focusedRightPeek = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelIntent = useCallback(() => {
    if (intentTimer.current !== null) clearTimeout(intentTimer.current);
    intentTimer.current = null;
  }, []);
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const dismissPreview = useCallback(() => {
    cancel();
    cancelIntent();
    blocked.current = true;
    focusedRightPeek.current = null;
    setIsPreview(false);
  }, [cancel, cancelIntent]);

  useEffect(() => {
    cancel();
    cancelIntent();
    setIsPreview(false);
    setPresentationMode('pinned');
    focusedRightPeek.current = null;
    blocked.current = false;
  }, [cancel, cancelIntent, resetKey, enabled]);

  const previousPinned = useRef(pinned);
  useEffect(() => {
    if (previousPinned.current && !pinned) dismissPreview();
    if (pinned) {
      setPresentationMode('pinned');
      cancel();
      cancelIntent();
      setIsPreview(false);
    }
    previousPinned.current = pinned;
  }, [pinned, cancel, cancelIntent, dismissPreview]);

  useEffect(() => {
    if (!enabled) return;
    const selector = `[data-rail-toggle="${side}"]:not([data-rail-preview-trigger="false"]), [data-rail-preview-region="${side}"]`;
    const contextOccupiesRightSlot = () =>
      side === 'right' &&
      Boolean(
        document.querySelector(
          `${RIGHT_SLOT} [data-rail-context-occupied="true"]`
        )
      );
    const rightSlotOccupied = () =>
      contextOccupiesRightSlot() ||
      (side === 'right' &&
        !isPreview &&
        Boolean(
          document.querySelector(
            `${RIGHT_SLOT} [data-rail-phase][aria-hidden="false"]`
          )
        ));
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
      cancelIntent();
      if (timer.current !== null) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!retain()) setIsPreview(false);
      }, SHELL_RAIL_PREVIEW_GRACE_MS);
    };
    const enter = (event: Event) => {
      const target = event.target;
      if (side === 'right' && isPreview && event.type === 'focusin') {
        focusedRightPeek.current =
          target instanceof HTMLElement &&
          (target.closest(RIGHT_PEEK) ||
            ownedRailOverlays(RIGHT_PEEK).some(overlay =>
              overlay.contains(target)
            ))
            ? target
            : null;
      }
      // Re-entry can arrive from move() after an explicit close. It is still
      // pointer intent: keep the dwell and touch guard instead of treating
      // movement as immediate keyboard focus and moving the toggle mid-click.
      const pointer =
        event.type === 'pointerover' || event.type === 'pointermove';
      if (pointer) {
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
      if (pointer) {
        pointerInside.current = true;
      }
      if (pinned) return;
      // A pointer-down focuses a button before its click. Expanding here can
      // move the same toggle away before pointer-up, losing the activation.
      // Keyboard focus still previews immediately; pointer activation pins it.
      if (
        pressedToggle.current &&
        event.target instanceof Element &&
        pressedToggle.current.contains(event.target)
      )
        return;
      // An inspector or in-flow context stack already owns the right slot.
      if (rightSlotOccupied()) return;
      cancel();
      if (blocked.current) return;
      const open = () => {
        if (!isPreview) focusedRightPeek.current = null;
        setPresentationMode('preview');
        setIsPreview(true);
      };
      if (pointer && (event as PointerEvent).pointerType === 'touch') return;
      if (!pointer || enterIntentMs <= 0 || isPreview) {
        cancelIntent();
        open();
        return;
      }
      if (intentTimer.current !== null) return;
      intentTimer.current = setTimeout(() => {
        intentTimer.current = null;
        if (pointerInside.current && !blocked.current && !rightSlotOccupied())
          open();
      }, enterIntentMs);
    };
    const leave = (event: MouseEvent | FocusEvent) => {
      const wasInside = inside(event.target);
      if (event.type === 'pointerout') {
        pointerTarget.current = event.relatedTarget;
        pointerInside.current = inside(event.relatedTarget);
      }
      if (!wasInside || inside(event.relatedTarget)) return;
      if (retain()) return;
      cancelIntent();
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
      pressedToggle.current =
        event.target instanceof Element
          ? event.target.closest(`[data-rail-toggle="${side}"]`)
          : null;
      if (pressedToggle.current) cancelIntent();
      if (isPreview && !inside(event.target)) {
        dismissPreview();
        if (!inside(document.activeElement)) blocked.current = false;
      }
    };
    const release = () => {
      pressedToggle.current = null;
    };
    const escape = (event: KeyboardEvent) => {
      // A dialog/menu that consumed Escape in capture owns this dismissal.
      if (event.key === 'Escape' && !event.defaultPrevented && isPreview) {
        event.preventDefault();
        const focused = document.activeElement;
        dismissPreview();
        // Collapsing can hide the focused rail item; hand focus to the toggle
        // so keyboard users never land on <body>.
        if (
          inside(focused) &&
          !focused?.matches(`[data-rail-toggle="${side}"]`)
        )
          document
            .querySelector<HTMLElement>(`[data-rail-toggle="${side}"]`)
            ?.focus();
      }
    };
    const yieldToContext = () => {
      if (
        !contextOccupiesRightSlot() ||
        document.querySelector(
          '[data-rail-toggle="right"][data-rail-pinned="true"]'
        )
      )
        return false;

      const active = document.activeElement;
      const prior = focusedRightPeek.current;
      const lostPreviewFocus =
        prior &&
        (active === prior || (active === document.body && !prior.isConnected));
      dismissPreview();
      // The whole shared slot must relinquish floating placement now,
      // not after the ordinary preview exit finishes.
      setPresentationMode('pinned');
      if (lostPreviewFocus) {
        Array.from(
          document.querySelectorAll<HTMLElement>('[data-rail-toggle="right"]')
        )
          .find(isAvailable)
          ?.focus({ preventScroll: true });
      }
      return true;
    };
    const observer = new MutationObserver(() => {
      if (!isPreview || yieldToContext()) return;
      // A hovered portal may detach without delivering pointerout.
      pointerInside.current = inside(pointerTarget.current);
      scheduleLeave();
    });
    if (isPreview && !pinned && !yieldToContext())
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
          'data-rail-context-occupied',
          'id',
        ],
      });
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerover', enter);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusin', enter);
    document.addEventListener('focusout', leave);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
    document.addEventListener('keydown', escape);
    return () => {
      observer.disconnect();
      cancel();
      cancelIntent();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerover', enter);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusin', enter);
      document.removeEventListener('focusout', leave);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      document.removeEventListener('keydown', escape);
    };
  }, [
    enabled,
    pinned,
    side,
    isPreview,
    enterIntentMs,
    cancel,
    cancelIntent,
    dismissPreview,
  ]);

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
