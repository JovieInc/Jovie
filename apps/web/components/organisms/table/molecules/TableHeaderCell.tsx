'use client';

import type { Header } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { cn } from '../table.styles';

interface TableHeaderCellProps<TData> {
  header: Header<TData, unknown>;
  canSort: boolean;
  sortDirection: false | 'asc' | 'desc';
  stickyHeaderClass: string;
  tableHeaderClass: string;
  onToggleSort?: () => void;
}

/**
 * TableHeaderCell - Reusable table header cell component
 *
 * Features:
 * - Sortable headers with visual indicators
 * - Consistent styling across all table states
 * - Accessibility support (aria-labels, keyboard navigation)
 */
export function TableHeaderCell<TData>({
  header,
  canSort,
  sortDirection,
  stickyHeaderClass,
  tableHeaderClass,
  onToggleSort,
}: TableHeaderCellProps<TData>) {
  return (
    <th
      key={header.id}
      className={cn(stickyHeaderClass)}
      style={{
        width: header.getSize() !== 150 ? header.getSize() : undefined,
      }}
    >
      {header.isPlaceholder ? null : canSort ? (
        <button
          type='button'
          onClick={onToggleSort}
          className={cn(
            'flex items-center gap-2 px-6 py-3 text-left w-full',
            'text-xs font-semibold uppercase tracking-wide text-tertiary-token line-clamp-1',
            'hover:bg-surface-2/50 transition-colors rounded-md',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          )}
        >
          {flexRender(header.column.columnDef.header, header.getContext())}
          {sortDirection && (
            <svg
              width='12'
              height='12'
              viewBox='0 0 12 12'
              fill='none'
              className='shrink-0'
              style={{ color: 'lch(62.6% 1.35 272 / 1)' }}
              aria-hidden='true'
            >
              <title>
                {sortDirection === 'asc'
                  ? 'Sorted ascending'
                  : 'Sorted descending'}
              </title>
              {sortDirection === 'asc' ? (
                <path d='M6 3L9 7H3L6 3Z' fill='currentColor' />
              ) : (
                <path d='M6 9L3 5H9L6 9Z' fill='currentColor' />
              )}
            </svg>
          )}
        </button>
      ) : (
        <div className={cn(tableHeaderClass)}>
          {flexRender(header.column.columnDef.header, header.getContext())}
        </div>
      )}
    </th>
  );
}
