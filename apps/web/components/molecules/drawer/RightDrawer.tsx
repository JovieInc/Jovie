'use client';

// @coverage-via apps/web/tests/components/organisms/RightDrawer.interaction.test.tsx

import type { CommonDropdownItem } from '@jovie/ui';
import { CommonDropdown } from '@jovie/ui';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SHELL_RAIL_ALLOCATION,
  SHELL_RAIL_SHEET,
  SHELL_RAIL_TRAVEL,
} from '@/components/shell/rail-motion';
import { useRailFocusReturn } from '@/components/shell/useRailFocusReturn';
import { useRailMotionPhase } from '@/components/shell/useRailMotionPhase';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import {
  getFocusableElements,
  useModalFocusBoundary,
} from '@/lib/a11y/modal-focus-boundary';
import { cn } from '@/lib/utils';

/**
 * Lock body scroll when a mobile drawer is open to prevent
 * background page from scrolling behind the overlay.
 */
function useBodyScrollLock(isOpen: boolean, isMobile: boolean) {
  useEffect(() => {
    if (!isMobile || !isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, isOpen]);
}

/**
 * Mobile rails behave as one modal surface. The last opened rail wins focus
 * ownership, while any previously mounted rail is made inert and visually
 * closed without requiring each route to duplicate coordination logic.
 */
function useActiveMobileDrawer(
  isOpen: boolean,
  isMobile: boolean,
  drawerId: string
) {
  const [isActive, setIsActive] = useState(isOpen && isMobile);

  useEffect(() => {
    const handleDrawerOpen = (event: Event) => {
      const openedDrawerId = (event as CustomEvent<string>).detail;
      if (openedDrawerId !== drawerId) {
        setIsActive(false);
      }
    };

    document.addEventListener('jovie:right-drawer-open', handleDrawerOpen);
    return () =>
      document.removeEventListener('jovie:right-drawer-open', handleDrawerOpen);
  }, [drawerId]);

  useEffect(() => {
    if (!isOpen || !isMobile) {
      setIsActive(false);
      return;
    }

    setIsActive(true);
    document.dispatchEvent(
      new CustomEvent<string>('jovie:right-drawer-open', {
        detail: drawerId,
      })
    );
  }, [drawerId, isMobile, isOpen]);

  return isActive;
}

function isRestorableFocusTarget(
  element: HTMLElement | null
): element is HTMLElement {
  if (!element?.isConnected) return false;
  if (element === document.body || element === document.documentElement) {
    return false;
  }
  if (element.closest('[inert], [aria-hidden="true"]')) return false;
  if ('disabled' in element && Boolean(element.disabled)) return false;

  const style = globalThis.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    typeof element.focus === 'function'
  );
}

function findFocusRestorationFallback(
  drawer: HTMLElement | null
): HTMLElement | null {
  return (
    getFocusableElements(document.body).find(
      element => !drawer?.contains(element) && isRestorableFocusTarget(element)
    ) ?? null
  );
}

function useMobileDrawerFocus(
  drawerRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  isMobile: boolean,
  isActive: boolean
) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const drawerElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const restorationTokenRef = useRef(0);
  const mountGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const isCurrentMountGeneration = React.useCallback(
    (generation: number) => generation === mountGenerationRef.current,
    []
  );

  const restoreFocusIfOwned = React.useCallback(() => {
    const drawer = drawerElementRef.current;
    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusBelongsToDrawer =
      activeElement === document.body ||
      activeElement === document.documentElement ||
      !isRestorableFocusTarget(activeElement) ||
      Boolean(drawer?.contains(activeElement));

    if (!focusBelongsToDrawer) {
      // A navigation or another live control owns focus now. Returning focus
      // to a stale drawer trigger would steal that interaction.
      triggerRef.current = null;
      drawerElementRef.current = null;
      wasOpenRef.current = false;
      return;
    }

    const target = isRestorableFocusTarget(triggerRef.current)
      ? triggerRef.current
      : findFocusRestorationFallback(drawer);

    if (target && target !== activeElement) {
      target.focus({ preventScroll: true });
    }

    triggerRef.current = null;
    drawerElementRef.current = null;
    wasOpenRef.current = false;
  }, []);

  const scheduleFocusRestoration = React.useCallback(() => {
    const token = ++restorationTokenRef.current;
    globalThis.queueMicrotask(() => {
      if (token !== restorationTokenRef.current) return;
      restoreFocusIfOwned();
    });
  }, [restoreFocusIfOwned]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || !isMobile || !isOpen || !isActive) return;

    // Invalidate a queued close restoration before handling any reopen.
    restorationTokenRef.current += 1;
    if (wasOpenRef.current) return;

    drawerElementRef.current = drawer;

    const activeElement = document.activeElement;
    triggerRef.current =
      activeElement instanceof HTMLElement &&
      !drawer.contains(activeElement) &&
      isRestorableFocusTarget(activeElement)
        ? activeElement
        : null;

    const initialFocusTarget =
      drawer.querySelector<HTMLElement>('[data-drawer-initial-focus]') ??
      getFocusableElements(drawer)[0] ??
      drawer;
    initialFocusTarget.focus();
    wasOpenRef.current = true;
  }, [drawerRef, isActive, isMobile, isOpen]);

  useEffect(() => {
    if (isOpen && !isActive) {
      // A newer mobile rail owns focus now. Do not pull focus back to this
      // rail's trigger when its route later unmounts.
      restorationTokenRef.current += 1;
      wasOpenRef.current = false;
      triggerRef.current = null;
      drawerElementRef.current = null;
    }
  }, [isActive, isOpen]);

  useEffect(() => {
    if (isOpen || !wasOpenRef.current) return;

    scheduleFocusRestoration();
  }, [isOpen, scheduleFocusRestoration]);

  useEffect(() => {
    const generation = ++mountGenerationRef.current;
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      globalThis.queueMicrotask(() => {
        if (
          mountedRef.current ||
          !isCurrentMountGeneration(generation) ||
          !wasOpenRef.current
        ) {
          return;
        }
        scheduleFocusRestoration();
      });
    };
  }, [isCurrentMountGeneration, scheduleFocusRestoration]);

  useModalFocusBoundary(drawerRef, isMobile && isOpen && isActive, {
    restoreFocus: false,
  });
}

function hasOpenModalDialog(exclude: HTMLElement | null) {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'
    )
  ).some(element => {
    if (element === exclude) return false;

    const style = globalThis.getComputedStyle(element);
    return (
      element.getAttribute('aria-hidden') !== 'true' &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });
}

export interface RightDrawerProps
  extends Omit<
    React.HTMLAttributes<HTMLElement>,
    'children' | 'className' | 'onKeyDown'
  > {
  readonly isOpen: boolean;
  readonly width: number;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly contextMenuItems?: CommonDropdownItem[];
}

export function RightDrawer({
  isOpen,
  width,
  children,
  className,
  ariaLabel,
  onKeyDown,
  contextMenuItems,
  ...rest
}: RightDrawerProps) {
  const asideRef = useRef<HTMLElement>(null);
  const drawerId = useId();
  const isMobile = useBreakpointDown('lg');
  const isActiveMobileDrawer = useActiveMobileDrawer(
    isOpen,
    isMobile,
    drawerId
  );
  const [hasAnimated, setHasAnimated] = useState(false);
  // Shared rail lifecycle (JOV-4522): `closing` keeps the panel visible while
  // opacity/travel stage with the width give-back, instead of snapping to
  // `invisible` at frame one. `data-rail-phase` is the certification hook.
  const railPhase = useRailMotionPhase(isOpen);
  useRailFocusReturn(asideRef, !isOpen && !isMobile, 'right');

  // Suppress the width/opacity transition on first paint so the panel appears
  // at its final size instead of animating in on hydration. The transition
  // class is now constant (no transition-none -> live class swap, which was the
  // one-frame flash on Windows Chrome); only the inline duration is gated, and
  // it's cleared after the first painted frame so subsequent opens animate.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setHasAnimated(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Prevent background scroll when mobile drawer is open
  useBodyScrollLock(isOpen && isActiveMobileDrawer, isMobile);
  useMobileDrawerFocus(asideRef, isOpen, isMobile, isActiveMobileDrawer);

  // Handle keyboard events at the document level when drawer is open
  useEffect(() => {
    if (!isOpen || !onKeyDown || (isMobile && !isActiveMobileDrawer)) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (event.defaultPrevented || hasOpenModalDialog(asideRef.current)) {
          return;
        }
        onKeyDown(event);
        return;
      }

      // Only handle events when the drawer or its children have focus
      if (
        asideRef.current &&
        (asideRef.current === document.activeElement ||
          asideRef.current.contains(document.activeElement))
      ) {
        onKeyDown(event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActiveMobileDrawer, isMobile, isOpen, onKeyDown]);

  const hasContextMenu =
    contextMenuItems != null && contextMenuItems.length > 0;

  const innerContent = <div className='h-full min-h-0'>{children}</div>;

  const content = hasContextMenu ? (
    <CommonDropdown variant='context' size='compact' items={contextMenuItems}>
      {innerContent}
    </CommonDropdown>
  ) : (
    innerContent
  );

  // Mobile: full-screen overlay with slide-in-from-right animation
  if (isMobile) {
    // Escape the route's isolated stacking context so its header cannot paint
    // above this modal. React context and the existing focus boundary survive
    // the portal; dialogs opened from the sheet retain their higher layer.
    return createPortal(
      <aside
        {...rest}
        ref={asideRef}
        aria-hidden={!isOpen || !isActiveMobileDrawer}
        aria-modal={isOpen && isActiveMobileDrawer ? true : undefined}
        aria-label={ariaLabel}
        role='dialog'
        inert={!isOpen || !isActiveMobileDrawer ? true : undefined}
        tabIndex={isOpen ? -1 : undefined}
        data-rail-phase={railPhase}
        className={cn(
          'fixed inset-0 z-sheet flex flex-col',
          'overflow-hidden',
          'outline-none focus:outline-none focus-visible:ring-0',
          'border-l border-(--app-shell-frame-seam) bg-(--app-shell-content-surface)',
          'shadow-(--app-shell-drawer-shadow)',
          'pb-[env(safe-area-inset-bottom)]',
          SHELL_RAIL_SHEET,
          isOpen && isActiveMobileDrawer
            ? 'translate-x-0'
            : 'translate-x-full pointer-events-none',
          className
        )}
      >
        {content}
      </aside>,
      document.body
    );
  }

  // Desktop: the shared shell contains this inspector as an overlay.
  return (
    <aside
      {...rest}
      ref={asideRef}
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      tabIndex={isOpen ? -1 : undefined}
      inert={isOpen ? undefined : true}
      data-rail-phase={railPhase}
      className={cn(
        // The shell owns overlay placement and bounds. The drawer owns its
        // raised surface, interrupted reveal, focus and interaction lifecycle.
        'z-10 shrink-0 h-full min-h-0 flex flex-col rounded-(--app-shell-radius) border border-(--app-shell-frame-seam) bg-surface-1 shadow-(--app-shell-drawer-shadow)',
        'outline-none focus:outline-none focus-visible:ring-0',
        'overflow-hidden',
        SHELL_RAIL_ALLOCATION,
        // The panel stays `visible` through `closing` so the opacity + 6px
        // directional travel stage against the concurrent width give-back;
        // `invisible` only applies once the rail has fully settled closed.
        // Reopening mid-exit reverses in place — no snap, no stale overlay.
        railPhase === 'closed' ? 'invisible' : 'visible',
        isOpen
          ? 'opacity-100 translate-x-0'
          : cn(
              'opacity-0 pointer-events-none',
              SHELL_RAIL_TRAVEL.right,
              // Below lg this branch only renders before hydration resolves
              // the mobile overlay; a closed in-flow rail there would hold
              // space the fixed overlay then releases, shifting the page.
              'max-lg:hidden'
            ),
        className
      )}
      style={{
        width: isOpen ? width : 0,
        borderWidth: isOpen ? 1 : 0,
        maxWidth: 'calc(100cqw - var(--space-3))',
        transitionDuration: hasAnimated ? undefined : '0ms',
        willChange:
          railPhase === 'opening' || railPhase === 'closing'
            ? 'opacity, transform'
            : 'auto',
        contain: 'layout style paint',
      }}
    >
      <div
        className='relative flex h-full min-h-0 flex-col'
        // Keep controls, text, and scroll geometry at their open width while
        // the outer allocation clips/reveals them; no rewrapping per frame.
        style={{
          width: Math.max(0, width - 2),
          maxWidth: 'calc(100cqw - var(--space-3) - 2px)',
          flexShrink: 0,
        }}
      >
        {content}
      </div>
    </aside>
  );
}
