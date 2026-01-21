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

export function AdminTableShell({
  toolbar,
  footer,
  children,
  className,
  scrollContainerProps,
  scrollContainerRef: externalRef,
}: AdminTableShellProps) {
  const internalRef = React.useRef<HTMLDivElement | null>(null);
  const tableContainerRef = externalRef ?? internalRef;
  const [headerElevated, setHeaderElevated] = React.useState(false);

  React.useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setHeaderElevated(container.scrollTop > 0);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
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
