'use client';

/**
 * BaseSidebar Component
 *
 * A composable sidebar component with shared state management,
 * keyboard handling, and responsive behavior.
 */

import { X } from 'lucide-react';
import { forwardRef, useEffect } from 'react';

import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { cn } from '@/lib/utils';

import type {
  BaseSidebarContentProps,
  BaseSidebarFooterProps,
  BaseSidebarHeaderProps,
  BaseSidebarProps,
} from './types';
import { useSidebarEscapeKey } from './useSidebarEscapeKey';

/**
 * Get the transform class for sidebar visibility state.
 */
function getSidebarTransformClass(isOpen: boolean, isLeft: boolean): string {
  if (isOpen) {
    return 'translate-x-0 opacity-100';
  }
  const translateClass = isLeft ? '-translate-x-full' : 'translate-x-full';
  return `${translateClass} opacity-0 pointer-events-none`;
}

/**
 * Main sidebar container component.
 */
export const BaseSidebar = forwardRef<HTMLElement, BaseSidebarProps>(
  function BaseSidebar(
    {
      isOpen,
      onClose,
      position = 'right',
      width = 320,
      children,
      className,
      ariaLabel = 'Sidebar',
      closeOnEscape = true,
      showOverlay = true,
      testId,
    },
    ref
  ) {
    useSidebarEscapeKey({ isOpen, onClose, closeOnEscape });

    const isLeft = position === 'left';
    const isMobile = useBreakpointDown('md');

    // Prevent background scroll when mobile sidebar is open
    useEffect(() => {
      if (!isMobile || !isOpen) return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }, [isMobile, isOpen]);

    return (
      <>
        {/* Overlay for mobile */}
        {showOverlay && (
          <div
            className={cn(
              'fixed inset-0 z-40 bg-black/50 md:hidden',
              'transition-opacity duration-200',
              isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            onClick={onClose}
            aria-hidden='true'
          />
        )}

        {/* Sidebar panel */}
        <aside
          ref={ref}
          aria-label={ariaLabel}
          aria-hidden={!isOpen}
          data-testid={testId}
          className={cn(
            'fixed top-0 z-50 h-svh flex flex-col',
            'bg-surface-0 border-subtle shadow-xl overflow-hidden',
            'transition-[transform,opacity] duration-200 ease-out',
            'max-w-[100vw]',
            isLeft ? 'left-0 border-r' : 'right-0 border-l',
            getSidebarTransformClass(isOpen, isLeft),
            className
          )}
          style={{ width }}
        >
          {children}
        </aside>
      </>
    );
  }
);

/**
 * Sidebar header with optional close button.
 */
export function BaseSidebarHeader({
  children,
  className,
  showCloseButton = true,
  onClose,
}: BaseSidebarHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between shrink-0',
        'border-b border-subtle px-4 py-3',
        className
      )}
    >
      <div className='flex-1 min-w-0'>{children}</div>
      {showCloseButton && onClose && (
        <button
          type='button'
          onClick={onClose}
          className={cn(
            'ml-2 p-1.5 rounded-md shrink-0',
            'text-secondary-token hover:text-primary-token',
            'hover:bg-interactive-hover transition-colors',
            'focus-visible:outline-none focus-visible:bg-interactive-hover'
          )}
          aria-label='Close sidebar'
        >
          <X className='h-4 w-4' aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Scrollable content area.
 */
export function BaseSidebarContent({
  children,
  className,
}: BaseSidebarContentProps) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0 overflow-auto overscroll-contain',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Footer area pinned to bottom.
 */
export function BaseSidebarFooter({
  children,
  className,
}: BaseSidebarFooterProps) {
  return (
    <div className={cn('shrink-0 border-t border-subtle px-4 py-3', className)}>
      {children}
    </div>
  );
}
