'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { CommonDropdown } from '@jovie/ui';
import React, { useEffect, useId, useRef, useState } from 'react';

import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { cn } from '@/lib/utils';

/**
 * Lock body scroll when a mobile drawer is open to prevent
 * background page from scrolling behind the overlay.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(element => !element.hasAttribute('inert'));
}

function getDrawerBackgroundElements(drawer: HTMLElement) {
  const background: HTMLElement[] = [];
  let current: HTMLElement | null = drawer;

  while (current?.parentElement) {
    for (const sibling of Array.from(current.parentElement.children)) {
      if (sibling !== current && sibling instanceof HTMLElement) {
        background.push(sibling);
      }
    }
    current = current.parentElement;
  }

  return background;
}

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

function useMobileDrawerFocus(
  drawerRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  isMobile: boolean,
  isActive: boolean
) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || !isMobile || !isOpen || !isActive) return;

    const activeElement = document.activeElement;
    triggerRef.current =
      activeElement instanceof HTMLElement && !drawer.contains(activeElement)
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
      wasOpenRef.current = false;
      triggerRef.current = null;
    }
  }, [isActive, isOpen]);

  useEffect(() => {
    if (isOpen || !wasOpenRef.current) return;

    wasOpenRef.current = false;
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger?.isConnected) {
      trigger.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || !isMobile || !isOpen || !isActive) return;

    const background = getDrawerBackgroundElements(drawer);
    const priorInertStates = background.map(element => ({
      element,
      wasInert: element.inert,
    }));
    for (const { element } of priorInertStates) {
      element.inert = true;
    }

    return () => {
      for (const { element, wasInert } of priorInertStates) {
        element.inert = wasInert;
      }
    };
  }, [drawerRef, isActive, isMobile, isOpen]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || !isMobile || !isOpen || !isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(drawer);
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerRef, isActive, isMobile, isOpen]);
}

function hasOpenModalDialog() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'
    )
  ).some(element => {
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
        if (event.defaultPrevented || hasOpenModalDialog()) {
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
    return (
      <aside
        {...rest}
        ref={asideRef}
        aria-hidden={!isOpen || !isActiveMobileDrawer}
        aria-modal={isOpen && isActiveMobileDrawer ? true : undefined}
        aria-label={ariaLabel}
        role='dialog'
        inert={!isOpen || !isActiveMobileDrawer ? true : undefined}
        tabIndex={isOpen ? -1 : undefined}
        className={cn(
          'fixed inset-0 z-50 flex flex-col',
          'overflow-hidden',
          'outline-none focus:outline-none focus-visible:ring-0',
          'border-l border-(--app-shell-frame-seam) bg-(--app-shell-content-surface)',
          'shadow-(--linear-app-drawer-shadow)',
          'pb-[env(safe-area-inset-bottom)]',
          'transition-transform duration-cinematic ease-cinematic motion-reduce:transition-none',
          isOpen && isActiveMobileDrawer
            ? 'translate-x-0'
            : 'translate-x-full pointer-events-none',
          className
        )}
      >
        {content}
      </aside>
    );
  }

  // Desktop: inline sidebar with width-based collapse so adjacent content reclaims space
  return (
    <aside
      {...rest}
      ref={asideRef}
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      tabIndex={isOpen ? -1 : undefined}
      inert={isOpen ? undefined : true}
      className={cn(
        // Desktop inspector is an in-flow sibling of route content, but it
        // remains its own raised surface. This gives the shell one stable
        // elevation ladder: base/sidebar → main plane → inspector → overlays.
        'z-10 shrink-0 h-full min-h-0 flex flex-col rounded-(--app-shell-radius) border border-(--app-shell-frame-seam) bg-surface-1 shadow-(--linear-app-drawer-shadow)',
        'outline-none focus:outline-none focus-visible:ring-0',
        'overflow-hidden',
        'transition-[width,opacity] duration-cinematic ease-cinematic motion-reduce:transition-none',
        isOpen
          ? 'visible opacity-100'
          : 'opacity-0 pointer-events-none invisible',
        className
      )}
      style={{
        width: isOpen ? width : 0,
        maxWidth: '100vw',
        transitionDuration: hasAnimated ? undefined : '0ms',
        willChange: hasAnimated ? 'width, opacity' : 'auto',
        contain: 'layout style paint',
      }}
    >
      <div
        className='relative flex h-full min-h-0 flex-col'
        style={{ minWidth: '100%' }}
      >
        {content}
      </div>
    </aside>
  );
}
