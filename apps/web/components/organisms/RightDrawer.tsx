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
        'fixed top-0 right-0 z-40 h-svh flex flex-col',
        'bg-(--color-bg-surface-2) border-l border-subtle shadow-xl',
        'transition-[transform,opacity] duration-300 ease-out',
        isOpen
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 pointer-events-none invisible',
        className
      )}
      style={{ width }}
    >
      {children}
    </aside>
  );
}
