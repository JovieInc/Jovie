'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AdminTableShellRenderProps {
  headerElevated: boolean;
  /** Pixel offset for sticky table headers when a toolbar is present. */
  stickyTopPx: number;
}

export interface AdminTableShellProps {
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  children: (props: AdminTableShellRenderProps) => React.ReactNode;
  className?: string;
  scrollContainerProps?: Omit<
    React.HTMLAttributes<HTMLDivElement>,
    'children' | 'className' | 'ref'
  >;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

const TOOLBAR_HEIGHT_PX = 56;

/**
 * Throttle interval for scroll handler (ms).
 * 100ms provides smooth visual updates while reducing state updates from 60+/sec to 10/sec.
 */
const SCROLL_THROTTLE_MS = 100;

export function AdminTableShell({
  toolbar,
  footer,
  children,
  className,
  scrollContainerProps,
  scrollContainerRef: externalRef,
}: Readonly<AdminTableShellProps>) {
  const internalRef = React.useRef<HTMLDivElement | null>(null);
  const tableContainerRef = externalRef ?? internalRef;
  const [headerElevated, setHeaderElevated] = React.useState(false);
  const lastScrollTimeRef = React.useRef(0);
  const rafIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    // Helper to update header elevation state
    const updateHeaderElevation = () => {
      rafIdRef.current = null;
      const isScrolled = container.scrollTop > 0;
      setHeaderElevated(prev => (prev !== isScrolled ? isScrolled : prev));
      lastScrollTimeRef.current = Date.now();
    };

    // Throttled scroll handler using requestAnimationFrame + time check
    const handleScroll = () => {
      const now = Date.now();

      // Skip if we're within the throttle window
      if (now - lastScrollTimeRef.current < SCROLL_THROTTLE_MS) {
        // Schedule one final update after throttle period ends
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(updateHeaderElevation);
        }
        return;
      }

      lastScrollTimeRef.current = now;
      const isScrolled = container.scrollTop > 0;
      setHeaderElevated(prev => (prev !== isScrolled ? isScrolled : prev));
    };

    // Initial check
    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [tableContainerRef]);

  const stickyTopPx = toolbar ? TOOLBAR_HEIGHT_PX : 0;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col rounded-xl border border-subtle bg-surface-1 contain-layout',
        className
      )}
    >
      <div
        ref={tableContainerRef}
        className='min-h-0 flex-1 overflow-auto flex flex-col rounded-xl focus-visible:outline-none'
        {...scrollContainerProps}
      >
        {toolbar ? (
          <div
            className={cn(
              'sticky top-0 z-30 border-b border-subtle bg-surface-1',
              headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
            )}
          >
            {toolbar}
          </div>
        ) : null}

        {children({ headerElevated, stickyTopPx })}
      </div>

      {footer ? (
        <div className='border-t border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70'>
          {footer}
        </div>
      ) : null}
    </div>
  );
}
