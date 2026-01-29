'use client';

import type { Header } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { Icon } from '@/components/atoms/Icon';
import { cn, iconColors } from '../table.styles';

interface TableHeaderCellProps<TData>
  extends Readonly<{
    header: Header<TData, unknown>;
    canSort: boolean;
    sortDirection: false | 'asc' | 'desc';
    stickyHeaderClass: string;
    tableHeaderClass: string;
    onToggleSort?: (event: unknown) => void;
  }> {}

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
  // Determine aria-sort attribute without nested ternaries
  let ariaSort: 'ascending' | 'descending' | 'none' | undefined;
  if (!canSort || header.isPlaceholder) {
    ariaSort = undefined;
  } else if (sortDirection === 'asc') {
    ariaSort = 'ascending';
  } else if (sortDirection === 'desc') {
    ariaSort = 'descending';
  } else {
    ariaSort = 'none';
  }

  return (
    <th
      key={header.id}
      scope='col'
      aria-sort={ariaSort}
      className={cn(stickyHeaderClass)}
      style={{
        width: header.getSize() !== 150 ? header.getSize() : undefined,
      }}
    >
      {(() => {
        if (header.isPlaceholder) return null;
        if (canSort) {
          return (
            <button
              type='button'
              onClick={onToggleSort}
              className={cn(
                tableHeaderClass,
                'flex w-full items-center gap-2',
                'hover:bg-surface-2/50 transition-colors rounded-md',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              )}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
              {sortDirection && (
                <Icon
                  name={sortDirection === 'asc' ? 'ArrowUp' : 'ArrowDown'}
                  className={cn('shrink-0', iconColors.sortIndicator)}
                  ariaLabel={
                    sortDirection === 'asc'
                      ? 'Sorted ascending'
                      : 'Sorted descending'
                  }
                  size={12}
                />
              )}
            </button>
          );
        }
        return (
          <div className={cn(tableHeaderClass)}>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        );
      })()}
    </th>
  );
}
