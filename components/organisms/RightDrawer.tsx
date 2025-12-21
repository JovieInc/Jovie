'use client';

import React from 'react';

import { cn } from '@/lib/utils';

export interface RightDrawerProps {
  isOpen: boolean;
  width: number;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  /** Enable full-screen mode on mobile with backdrop overlay */
  mobileFullScreen?: boolean;
  /** Callback when backdrop is clicked (mobile only) */
  onBackdropClick?: () => void;
}

export function RightDrawer({
  isOpen,
  width,
  children,
  className,
  ariaLabel,
  mobileFullScreen = false,
  onBackdropClick,
}: RightDrawerProps) {
  return (
    <>
      {/* Backdrop overlay for mobile full-screen mode */}
      {mobileFullScreen && (
        <div
          className={cn(
            'fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden',
            'transition-opacity duration-300 ease-out',
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          onClick={onBackdropClick}
          aria-hidden='true'
        />
      )}

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
          // Mobile full-screen mode: full width on mobile, fixed width on desktop
          mobileFullScreen && 'w-full lg:w-auto',
          className
        )}
        style={
          mobileFullScreen
            ? ({ '--drawer-width': `${width}px` } as React.CSSProperties)
            : { width }
        }
      >
        {/* Apply fixed width only on desktop when using mobile full-screen mode */}
        {mobileFullScreen ? (
          <div className='flex flex-col h-full lg:w-[var(--drawer-width)]'>
            {children}
          </div>
        ) : (
          children
        )}
      </aside>
    </>
  );
}
