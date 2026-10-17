'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AdminTableShellRenderProps {
  readonly headerElevated: boolean;
  /** Sticky headers start at zero: the toolbar is outside the scrolling region. */
  readonly stickyTopPx: number;
}

export interface AdminTableShellProps {
  readonly toolbar?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly children: (props: AdminTableShellRenderProps) => React.ReactNode;
  readonly className?: string;
  readonly testId?: string;
  readonly scrollContainerProps?: Readonly<
    Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'ref'>
  >;
  readonly scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

export function AdminTableShell({
  toolbar,
  footer,
  children,
  className,
  testId,
  scrollContainerProps,
  scrollContainerRef: externalRef,
}: Readonly<AdminTableShellProps>) {
  const [headerElevated, setHeaderElevated] = React.useState(false);

  // Capture scroll from the actual table (or the card/kanban view). The shell
  // owns chrome; the child owns scrolling and virtualization measurement.
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement) {
      setHeaderElevated(event.target.scrollTop > 0);
    }
  };

  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden contain-layout',
        className
      )}
      data-testid={testId}
    >
      {toolbar ? (
        <div
          className={cn(
            'shrink-0 border-b border-(--app-shell-frame-seam) bg-(--app-shell-content-surface)',
            headerElevated && 'dark:shadow-inset-highlight'
          )}
        >
          {toolbar}
        </div>
      ) : null}
      <div
        ref={externalRef}
        className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden focus-visible:outline-none'
        onScrollCapture={handleScroll}
        {...scrollContainerProps}
      >
        {children({ headerElevated, stickyTopPx: 0 })}
      </div>

      {footer ? (
        <div className='shrink-0 border-t border-(--app-shell-frame-seam)'>
          {footer}
        </div>
      ) : null}
    </div>
  );
}
