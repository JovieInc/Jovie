'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SHELL_RAIL_PREVIEW_GRACE_MS } from './rail-motion';

/** Input adapter for the existing Radix layers. Hover never claims focus. */
export function useSidebarFlyout(owner: string) {
  const [open, setOpen] = useState(false);
  const [explicitOpen, setExplicitOpen] = useState(false);
  const [topClearance, setTopClearance] = useState(8);
  const explicit = useRef(false);
  const siblingDismissal = useRef(false);
  const closingWasExplicit = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const onOpenChange = useCallback(
    (value: boolean) => {
      cancel();
      if (value) {
        siblingDismissal.current = false;
        document.dispatchEvent(
          new CustomEvent('jovie:sidebar-flyout-open', { detail: owner })
        );
        const toolbar =
          document.querySelector<HTMLElement>(
            'html[data-desktop-runtime="electron"] [data-electron-titlebar="true"]'
          ) ??
          document.querySelector<HTMLElement>('[data-app-shell-header="true"]');
        setTopClearance(
          Math.max(8, (toolbar?.getBoundingClientRect().bottom ?? 0) + 8)
        );
      }
      setOpen(value);
      if (!value) {
        closingWasExplicit.current = explicit.current;
        explicit.current = false;
        setExplicitOpen(false);
      }
    },
    [cancel, owner]
  );
  useEffect(() => {
    const closeSibling = (event: Event) => {
      if ((event as CustomEvent<string>).detail === owner) return;
      siblingDismissal.current = true;
      onOpenChange(false);
    };
    document.addEventListener('jovie:sidebar-flyout-open', closeSibling);
    return () =>
      document.removeEventListener('jovie:sidebar-flyout-open', closeSibling);
  }, [onOpenChange, owner]);
  const enter = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType === 'touch') return;
      cancel();
      if (!open) timer.current = setTimeout(() => onOpenChange(true), 160);
    },
    [cancel, onOpenChange, open]
  );
  const leave = useCallback(
    (event: React.PointerEvent) => {
      cancel();
      if (explicit.current) return;
      const target = event.relatedTarget;
      if (
        target instanceof Element &&
        target.closest(`[data-sidebar-flyout-owner="${owner}"]`)
      )
        return;
      timer.current = setTimeout(() => {
        if (
          document.activeElement?.closest(
            `[data-sidebar-flyout-owner="${owner}"]`
          )
        )
          return;
        onOpenChange(false);
      }, SHELL_RAIL_PREVIEW_GRACE_MS);
    },
    [cancel, onOpenChange, owner]
  );
  return {
    open,
    onOpenChange,
    collisionPadding: { top: topClearance, right: 8, bottom: 8, left: 8 },
    hover: { onPointerEnter: enter, onPointerLeave: leave },
    explicit,
    explicitOpen,
    onCloseAutoFocus: (event: Event) => {
      if (!closingWasExplicit.current || siblingDismissal.current)
        event.preventDefault();
    },
    activate: (event?: React.SyntheticEvent, focusExisting = true) => {
      const upgrade = open && !explicit.current;
      explicit.current = true;
      setExplicitOpen(true);
      cancel();
      if (upgrade && focusExisting) {
        event?.preventDefault();
        document
          .querySelector<HTMLElement>(
            `[data-sidebar-flyout="${owner}"] a[href], [data-sidebar-flyout="${owner}"] button, [data-sidebar-flyout="${owner}"] [role="menuitem"]`
          )
          ?.focus({ preventScroll: true });
      }
    },
  };
}
