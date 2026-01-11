'use client';

import React from 'react';

import { cn } from '@/lib/utils';

export interface RightDrawerProps {
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
}: RightDrawerProps) {
  return (
    <aside
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      tabIndex={isOpen ? -1 : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        'shrink-0 h-full flex flex-col',
        'bg-surface-2 border-l border-subtle',
        'transition-[width,opacity] duration-300 ease-out',
        isOpen
          ? 'opacity-100 visible'
          : 'opacity-0 pointer-events-none invisible w-0 border-l-0',
        className
      )}
      style={{ width: isOpen ? width : 0 }}
    >
      {children}
    </aside>
  );
}
