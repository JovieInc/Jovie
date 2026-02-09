'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { CommonDropdown } from '@jovie/ui';
import React, { useEffect, useRef } from 'react';

import { useIsMobile } from '@/hooks/useMobile';
import { cn } from '@/lib/utils';

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
  const isMobile = useIsMobile();

  // Handle keyboard events at the document level when drawer is open
  useEffect(() => {
    if (!isOpen || !onKeyDown) return;

    const handleKeyDown = (event: KeyboardEvent) => {
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

  const innerContent = (
    <div className='h-full overflow-y-auto overflow-x-hidden'>{children}</div>
  );

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
          'bg-surface-2',
          'transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none',
          className
        )}
      >
        {content}
      </aside>
    );
  }

  // Desktop: inline sidebar with width animation
  return (
    <aside
      {...rest}
      ref={asideRef}
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      tabIndex={isOpen ? -1 : undefined}
      className={cn(
        'shrink-0 h-full flex flex-col',
        'bg-surface-2 border-l border-subtle',
        'transition-[width,opacity] duration-300 ease-out',
        'overflow-hidden',
        isOpen
          ? 'opacity-100 visible'
          : 'opacity-0 pointer-events-none invisible w-0 border-l-0',
        className
      )}
      style={{ width: isOpen ? width : 0, maxWidth: '100vw' }}
    >
      {content}
    </aside>
  );
}
