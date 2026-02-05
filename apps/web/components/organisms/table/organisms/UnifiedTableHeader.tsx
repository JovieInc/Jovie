'use client';

import type { HeaderGroup } from '@tanstack/react-table';
import { TableHeaderCell } from '../molecules/TableHeaderCell';
import { presets } from '../table.styles';

export interface UnifiedTableHeaderProps<TData> {
  /**
   * Header groups from TanStack Table
   */
  readonly headerGroups: HeaderGroup<TData>[];

  /**
   * Accessible caption for the table
   */
  readonly caption?: string;
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
export function UnifiedTableHeader<TData>({
  headerGroups,
  caption,
}: UnifiedTableHeaderProps<TData>) {
  // Early return if no header groups
  if (headerGroups.length === 0) {
    return null;
  }

  return (
    <thead>
      {caption && <caption className='sr-only'>{caption}</caption>}
      {headerGroups.map(headerGroup => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map(header => (
            <TableHeaderCell
              key={header.id}
              header={header}
              canSort={header.column.getCanSort()}
              sortDirection={header.column.getIsSorted()}
              stickyHeaderClass={presets.stickyHeader}
              tableHeaderClass={presets.tableHeader}
              onToggleSort={header.column.getToggleSortingHandler()}
            />
          ))}
        </tr>
      ))}
    </thead>
  );
}
