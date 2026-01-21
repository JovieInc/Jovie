'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { CommonDropdown } from '@jovie/ui';
import React, { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface RightDrawerProps
  extends Omit<
    React.HTMLAttributes<HTMLElement>,
    'children' | 'className' | 'onKeyDown'
  > {
  isOpen: boolean;
  width: number;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  onKeyDown?: (event: KeyboardEvent) => void;
  contextMenuItems?: CommonDropdownItem[];
}

const CONTEXT_MENU_CONTENT_CLASS =
  'min-w-[10.5rem] rounded-lg p-0.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_50px_rgba(0,0,0,0.55)]';

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

  const drawerContent = (
    <aside
      {...rest}
      ref={asideRef}
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      tabIndex={isOpen ? -1 : undefined}
      className={cn(
        'shrink-0 h-full flex flex-col',
        'bg-surface-1 border-l border-subtle',
        'transition-[width,opacity] duration-300 ease-out',
        'overflow-hidden',
        isOpen
          ? 'opacity-100 visible'
          : 'opacity-0 pointer-events-none invisible w-0 border-l-0',
        className
      )}
      style={{ width: isOpen ? width : 0, maxWidth: '100vw' }}
    >
      <div className='h-full overflow-y-auto overflow-x-hidden'>{children}</div>
    </aside>
  );

  // Wrap with context menu if items are provided
  if (contextMenuItems && contextMenuItems.length > 0) {
    return (
      <CommonDropdown
        variant='context'
        items={contextMenuItems}
        contentClassName={CONTEXT_MENU_CONTENT_CLASS}
      >
        {drawerContent}
      </CommonDropdown>
    );
  }

  return drawerContent;
}
