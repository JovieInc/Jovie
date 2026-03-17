import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TableContainerProps {
  /** Whether the table is empty (shows empty state instead of table) */
  readonly isEmpty: boolean;
  /** Empty state component to show when isEmpty is true */
  readonly emptyState: ReactNode;
  /** Optional toolbar component (shows above table/empty state) */
  readonly toolbar?: ReactNode;
  /** Table content (shown when isEmpty is false) */
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * TableContainer - Standard full-height table wrapper with no-shift empty states
 *
 * Provides a consistent layout for all tables:
 * - Full-height flex container that prevents layout shift
 * - Optional toolbar area that doesn't scroll
 * - Content area that shows either empty state or scrollable table
 * - Empty state is vertically centered
 * - No layout shift between empty and populated states
 */
export function TableContainer({
  isEmpty,
  emptyState,
  toolbar,
  children,
  className,
}: TableContainerProps) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {/* Toolbar - shrinks to fit content */}
      {toolbar && <div className='shrink-0'>{toolbar}</div>}

      {/* Content area - expands to fill remaining space */}
      <div className='flex flex-1 min-h-0 flex-col overflow-hidden'>
        {isEmpty ? (
          // Full-height centered empty state
          <div className='flex flex-1 items-center justify-center p-8'>
            {emptyState}
          </div>
        ) : (
          // Scrollable table content
          <div className='flex-1 min-h-0 overflow-auto'>{children}</div>
        )}
      </div>
    </div>
  );
}
