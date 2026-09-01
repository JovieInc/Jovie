'use client';

import type { Header } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import '../table.types';
import { iconColors, tableAlignment } from '../table.styles';

interface TableHeaderCellProps<TData>
  extends Readonly<{
    readonly header: Header<TData, unknown>;
    readonly canSort: boolean;
    readonly sortDirection: false | 'asc' | 'desc';
    readonly stickyHeaderClass: string;
    readonly tableHeaderClass: string;
    readonly onToggleSort?: (event: unknown) => void;
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

  const meta = header.column.columnDef.meta;
  const metaClassName = meta?.className;
  const align = meta?.align ?? 'left';
  const isSemanticOnlyHeader = meta?.headerVisibility === 'sr-only';

  const headerContent = isSemanticOnlyHeader ? (
    <span className='sr-only'>
      {flexRender(header.column.columnDef.header, header.getContext())}
    </span>
  ) : (
    flexRender(header.column.columnDef.header, header.getContext())
  );
  const visibleHeaderContent = isSemanticOnlyHeader ? (
    headerContent
  ) : (
    <span className='min-w-0 truncate'>{headerContent}</span>
  );

  return (
    <th
      key={header.id}
      scope='col'
      aria-sort={ariaSort}
      className={cn(
        stickyHeaderClass,
        tableAlignment.text[align],
        metaClassName
      )}
      style={{
        width:
          header.getSize() >= 9999 || header.getSize() === 150
            ? undefined
            : header.getSize(),
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
                tableAlignment.headerButton[align],
                'rounded-full border border-transparent px-1.5 transition-[background-color,border-color,box-shadow] duration-subtle hover:border-subtle hover:bg-surface-1',
                'focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-1 focus-visible:ring-2 focus-visible:ring-ring/20'
              )}
            >
              {visibleHeaderContent}
              {sortDirection && (
                <Icon
                  name={sortDirection === 'asc' ? 'ArrowUp' : 'ArrowDown'}
                  className={cn('shrink-0', iconColors.sortIndicator)}
                  aria-hidden
                  size={12}
                />
              )}
            </button>
          );
        }
        return (
          <div
            className={cn(
              tableHeaderClass,
              'line-clamp-1',
              tableAlignment.text[align]
            )}
          >
            {headerContent}
          </div>
        );
      })()}
    </th>
  );
}
