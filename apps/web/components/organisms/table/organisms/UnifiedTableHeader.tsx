'use client';

import type { HeaderGroup, RowData } from '@/lib/tanstack-table';
import { TableHeaderCell } from '../molecules/TableHeaderCell';
import { presets } from '../table.styles';

export interface UnifiedTableHeaderProps<TData extends RowData> {
  /**
   * Header groups from TanStack Table
   */
  readonly headerGroups: HeaderGroup<TData>[];

  /**
   * Accessible caption for the table
   */
  readonly caption?: string;

  /**
   * Layout-snap header cells with the body when columns appear or disappear.
   * @default false
   */
  readonly columnSnap?: boolean;
}

/**
 * UnifiedTableHeader - Renders the table header section
 *
 * Features:
 * - Sortable column headers with visual indicators
 * - Sticky header positioning
 * - Consistent styling across all table states
 * - Accessibility support
 *
 * Example:
 * ```tsx
 * <UnifiedTableHeader
 *   headerGroups={table.getHeaderGroups()}
 *   caption="User data table"
 * />
 * ```
 */
export function UnifiedTableHeader<TData extends RowData>({
  headerGroups,
  caption,
  columnSnap = false,
}: UnifiedTableHeaderProps<TData>) {
  'use no memo';
  // TanStack keeps header groups stable while their column sorting state changes.
  // Compiler caching by group identity would leave the accessible sort state stale.
  // Early return if no header groups
  if (headerGroups.length === 0) {
    return null;
  }

  return (
    <>
      {caption && <caption className='sr-only'>{caption}</caption>}
      <thead>
        {headerGroups.map(headerGroup => (
          <tr key={headerGroup.id} className={presets.tableHeaderRow}>
            {headerGroup.headers.map(header => (
              <TableHeaderCell
                key={header.id}
                header={header}
                canSort={header.column.getCanSort()}
                sortDirection={header.column.getIsSorted()}
                stickyHeaderClass={presets.stickyHeader}
                tableHeaderClass={presets.tableHeaderCell}
                onToggleSort={header.column.getToggleSortingHandler()}
                columnSnap={columnSnap}
              />
            ))}
          </tr>
        ))}
      </thead>
    </>
  );
}
