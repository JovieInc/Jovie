'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { CommonDropdown } from '@jovie/ui';
import React, { useEffect, useRef, useState } from 'react';

import { useBreakpointDown } from '@/hooks/useBreakpoint';
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
  const isMobile = useBreakpointDown('lg');
  const [hasHydrated, setHasHydrated] = useState(false);

  // Suppress width/opacity transition on first paint to prevent layout shift
  // when the right panel mounts after hydration.
  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Prevent background scroll when mobile drawer is open
  useBodyScrollLock(isOpen, isMobile);

  // Handle keyboard events at the document level when drawer is open
  useEffect(() => {
    if (!isOpen || !onKeyDown) return;

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
  }, [isOpen, onKeyDown]);

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
        aria-hidden={!isOpen}
        aria-label={ariaLabel}
        tabIndex={isOpen ? -1 : undefined}
        className={cn(
          'fixed inset-0 z-50 flex flex-col',
          'overflow-hidden',
          'outline-none focus:outline-none focus:ring-0',
          'border-l border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)',
          'shadow-[var(--linear-app-drawer-shadow)]',
          'pb-[env(safe-area-inset-bottom)]',
          'transition-transform duration-cinematic ease-cinematic',
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none',
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
      className={cn(
        'z-10 shrink-0 h-full min-h-0 flex flex-col',
        'outline-none focus:outline-none focus:ring-0',
        hasHydrated
          ? 'transition-[width,opacity] duration-cinematic ease-cinematic'
          : 'transition-none',
        'overflow-hidden',
        isOpen
          ? 'visible opacity-100'
          : 'opacity-0 pointer-events-none invisible',
        className
      )}
      style={{ width: isOpen ? width : 0, maxWidth: '100vw' }}
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
