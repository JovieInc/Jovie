'use client';

import { cn } from '@jovie/ui/lib/utils';
import { SortableHeaderButton } from '../SortableHeaderButton';
import { borders, presets, tableAlignment } from '../table.styles';
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
        className={tableAlignment.headerButton[align]}
      />
    ) : (
      <span
        className={cn('block w-full line-clamp-1', tableAlignment.text[align])}
      >
        {children}
      </span>
    );

  return (
    <th
      className={cn(
        presets.tableHeaderCell,
        'whitespace-nowrap',
        // Sticky positioning
        sticky ? presets.stickyHeader : borders.header,
        // Alignment
        tableAlignment.text[align],
        // Width
        width,
        // Responsive hiding
        hideOnMobile && 'max-md:hidden md:table-cell',
        // Custom classes
        className
      )}
      style={sticky ? { top: `${stickyTop}px` } : undefined}
    >
      {content}
    </th>
  );
}
