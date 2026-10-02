'use client';

import { motion } from 'motion/react';
import { Icon } from '@/components/atoms/Icon';
import type { Header, RowData } from '@/lib/tanstack-table';
import { flexRender } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';
import '../table.types';
import { columnSnapTransition } from '../column-snap';
import { iconColors, tableAlignment } from '../table.styles';

interface TableHeaderCellProps<TData extends RowData>
  extends Readonly<{
    readonly header: Header<TData, unknown>;
    readonly canSort: boolean;
    readonly sortDirection: false | 'asc' | 'desc';
    readonly stickyHeaderClass: string;
    readonly tableHeaderClass: string;
    readonly onToggleSort?: (event: unknown) => void;
    /** Layout-snap this header with the body. The header row does not stagger. */
    readonly columnSnap?: boolean;
  }> {}

/**
 * TableHeaderCell - Reusable table header cell component
 *
 * Features:
 * - Sortable headers with visual indicators
 * - Consistent styling across all table states
 * - Accessibility support (aria-labels, keyboard navigation)
 */
export function TableHeaderCell<TData extends RowData>({
  header,
  canSort,
  sortDirection,
  stickyHeaderClass,
  tableHeaderClass,
  onToggleSort,
  columnSnap = false,
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

  const rawHeader = header.column.columnDef.header;
  const columnLabel =
    typeof rawHeader === 'string' && rawHeader.trim().length > 0
      ? rawHeader
      : header.column.id;

  // Accessible name carries label + current sort state so screen readers get
  // context that the aria-hidden direction glyph cannot provide (eval G4).
  const sortButtonLabel =
    sortDirection === 'asc'
      ? `${columnLabel}: sorted ascending`
      : sortDirection === 'desc'
        ? `${columnLabel}: sorted descending`
        : `${columnLabel}: not sorted, activate to sort`;

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

  const headerClassName = cn(
    stickyHeaderClass,
    tableAlignment.text[align],
    // The sort pill pads 6px; inset the cell 6px so the label lands on
    // the body cells' 12px text edge.
    canSort && 'px-1.5',
    metaClassName,
    'whitespace-nowrap'
  );
  const headerStyle = {
    width:
      header.getSize() >= 9999 || header.getSize() === 150
        ? undefined
        : header.getSize(),
  };
  const HeaderCell = columnSnap ? motion.th : 'th';

  return (
    <HeaderCell
      key={header.id}
      scope='col'
      aria-sort={ariaSort}
      className={headerClassName}
      style={headerStyle}
      {...(columnSnap
        ? {
            layout: true,
            transition: columnSnapTransition(0),
            'data-column-snap': 'on',
          }
        : {})}
    >
      {(() => {
        if (header.isPlaceholder) return null;
        if (canSort) {
          return (
            <button
              type='button'
              onClick={onToggleSort}
              aria-label={sortButtonLabel}
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
    </HeaderCell>
  );
}
