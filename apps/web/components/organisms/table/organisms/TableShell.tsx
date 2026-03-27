'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TableShellRenderProps {
  readonly headerElevated: boolean;
  readonly stickyTopPx: number;
}

export interface TableShellProps {
  readonly toolbar?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly children: (props: TableShellRenderProps) => React.ReactNode;
  readonly className?: string;
  readonly testId?: string;
  readonly scrollContainerProps?: Readonly<
    Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'ref'>
  >;
  readonly scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

const SCROLL_THROTTLE_MS = 100;

export function TableShell({
  toolbar,
  footer,
  children,
  className,
  testId,
  scrollContainerProps,
  scrollContainerRef: externalRef,
}: Readonly<TableShellProps>) {
  const internalRef = React.useRef<HTMLDivElement | null>(null);
  const tableContainerRef = externalRef ?? internalRef;
  const [headerElevated, setHeaderElevated] = React.useState(false);
  const [stickyTopPx, setStickyTopPx] = React.useState(0);
  const lastScrollTimeRef = React.useRef(0);
  const rafIdRef = React.useRef<number | null>(null);
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const updateHeaderElevation = () => {
      rafIdRef.current = null;
      const isScrolled = container.scrollTop > 0;
      setHeaderElevated(prev => (prev === isScrolled ? prev : isScrolled));
      lastScrollTimeRef.current = Date.now();
    };

    const handleScroll = () => {
      const now = Date.now();

      if (now - lastScrollTimeRef.current < SCROLL_THROTTLE_MS) {
        if (rafIdRef.current !== null) {
          return;
        }
        rafIdRef.current = requestAnimationFrame(updateHeaderElevation);
        return;
      }

      lastScrollTimeRef.current = now;
      const isScrolled = container.scrollTop > 0;
      setHeaderElevated(prev => (prev === isScrolled ? prev : isScrolled));
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafIdRef.current === null) {
        return;
      }
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [tableContainerRef]);

  React.useEffect(() => {
    if (!toolbar) {
      setStickyTopPx(0);
      return;
    }

    const toolbarElement = toolbarRef.current;
    if (!toolbarElement) {
      return;
    }

    const updateToolbarHeight = () => {
      setStickyTopPx(toolbarElement.getBoundingClientRect().height);
    };

    updateToolbarHeight();

    const resizeObserver = new ResizeObserver(updateToolbarHeight);
    resizeObserver.observe(toolbarElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [toolbar]);

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col contain-layout', className)}
      data-testid={testId}
    >
      <div
        ref={tableContainerRef}
        className='min-h-0 flex-1 flex flex-col overflow-auto focus-visible:outline-none'
        {...scrollContainerProps}
      >
        {toolbar ? (
          <div
            ref={toolbarRef}
            className={cn(
              'sticky top-0 z-30 border-b border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))]/96 backdrop-blur-[12px] supports-backdrop-filter:bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))]/88',
              headerElevated && 'dark:shadow-inset-highlight'
            )}
          >
            {toolbar}
          </div>
        ) : null}

        {children({ headerElevated, stickyTopPx })}
      </div>

      {footer ? (
        <div className='border-t border-(--linear-app-frame-seam)'>
          {footer}
        </div>
      ) : null}
    </div>
  );
}
