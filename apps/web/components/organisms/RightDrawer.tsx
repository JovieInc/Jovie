'use client';

import React from 'react';

import { cn } from '@/lib/utils';

export interface RightDrawerProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className'> {
  isOpen: boolean;
  width: number;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
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
  return (
    <aside
      {...rest}
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      tabIndex={isOpen ? -1 : undefined}
      onKeyDown={isOpen ? onKeyDown : undefined}
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
