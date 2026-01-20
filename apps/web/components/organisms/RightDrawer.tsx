'use client';

import React, { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface RightDrawerProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className'> {
  isOpen: boolean;
  width: number;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  onKeyDown?: (event: KeyboardEvent) => void;
}

export function RightDrawer({
  isOpen,
  width,
  children,
  className,
  ariaLabel,
  onKeyDown,
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

  return (
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
}
