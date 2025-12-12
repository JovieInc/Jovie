'use client';

import React from 'react';

import { cn } from '@/lib/utils';

export interface RightDrawerProps {
  isOpen: boolean;
  width: number;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function RightDrawer({
  isOpen,
  width,
  children,
  className,
  ariaLabel,
}: RightDrawerProps) {
  return (
    <aside
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      className={cn(
        'fixed top-0 right-0 z-40 h-svh flex flex-col',
        'bg-surface-1 border-l border-subtle shadow-xl',
        'transition-[transform,opacity] duration-300 ease-out',
        isOpen
          ? 'translate-x-0 opacity-100'
          : 'translate-x-full opacity-0 pointer-events-none',
        className
      )}
      style={{ width }}
    >
      {children}
    </aside>
  );
}
