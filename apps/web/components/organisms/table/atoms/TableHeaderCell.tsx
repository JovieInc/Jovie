'use client';

import { cn } from '@/lib/utils';
import { SortableHeaderButton } from '../SortableHeaderButton';
import type { TableCellProps } from './TableCell';

export interface TableHeaderCellProps extends Omit<TableCellProps, 'as'> {
  readonly sortable?: boolean;
  readonly sortDirection?: 'asc' | 'desc' | null;
  readonly onSort?: () => void;
  readonly sticky?: boolean;
  readonly stickyTop?: number; // Offset in pixels for sticky positioning
}

export function TableHeaderCell({
  children,
  width,
  align = 'left',
  className,
  hideOnMobile = false,
  sortable = false,
  sortDirection,
  onSort,
  sticky = true,
  stickyTop = 0,
}: TableHeaderCellProps) {
  const alignmentClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  // Map sort direction without nested ternary
  const sortButtonDirection =
    sortDirection === 'asc' || sortDirection === 'desc'
      ? sortDirection
      : undefined;

  const content =
    sortable && onSort ? (
      <SortableHeaderButton
        label={typeof children === 'string' ? children : String(children)}
        direction={sortButtonDirection}
        onClick={onSort}
      />
    ) : (
      <span className='text-xs font-medium text-tertiary-token'>
        {children}
      </span>
    );

  return (
    <th
      className={cn(
        // Base styles
        'px-4 py-3 border-b border-subtle text-[13px] text-tertiary-token',
        // Sticky positioning
        sticky && 'sticky z-20 bg-surface-1',
        // Alignment
        alignmentClasses[align],
        // Width
        width,
        // Responsive hiding
        hideOnMobile && 'hidden md:table-cell',
        // Custom classes
        className
      )}
      style={sticky ? { top: `${stickyTop}px` } : undefined}
    >
      {content}
    </th>
  );
}
