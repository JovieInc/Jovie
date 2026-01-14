'use client';

import { GroupHeader } from '../atoms/GroupHeader';
import type { useTableGrouping } from '../utils/useTableGrouping';

interface GroupedTableBodyProps<T> {
  /**
   * Grouped data from useTableGrouping hook
   */
  groupedData: ReturnType<typeof useTableGrouping<T>>['groupedData'];

  /**
   * Function to register group headers for observation
   */
  observeGroupHeader: ReturnType<
    typeof useTableGrouping<T>
  >['observeGroupHeader'];

  /**
   * Number of columns (for colSpan)
   */
  columns: number;

  /**
   * Render function for each row
   */
  renderRow: (row: T, index: number) => React.ReactNode;

  /**
   * Currently visible group index (for smart sticky behavior)
   */
  visibleGroupIndex?: number;
}

/**
 * GroupedTableBody - Table body with sticky group headers
 *
 * Features:
 * - Renders grouped rows with sticky headers
 * - Smart disappearing: current header fades when next reaches top
 * - Works with virtualization (when needed)
 * - Integrates with useTableGrouping hook
 *
 * Example:
 * ```tsx
 * const { groupedData, observeGroupHeader, visibleGroupIndex } = useTableGrouping({
 *   data: entries,
 *   getGroupKey: (entry) => entry.status,
 *   getGroupLabel: (status) => status.charAt(0).toUpperCase() + status.slice(1),
 *   enabled: true,
 * });
 *
 * <GroupedTableBody
 *   groupedData={groupedData}
 *   observeGroupHeader={observeGroupHeader}
 *   visibleGroupIndex={visibleGroupIndex}
 *   columns={6}
 *   renderRow={(entry, index) => (
 *     <WaitlistTableRow key={entry.id} entry={entry} rowNumber={index + 1} />
 *   )}
 * />
 * ```
 */
export function GroupedTableBody<T>({
  groupedData,
  observeGroupHeader,
  columns,
  renderRow,
  visibleGroupIndex = 0,
}: GroupedTableBodyProps<T>) {
  let globalRowIndex = 0;

  return (
    <tbody>
      {groupedData.map((group, groupIndex) => {
        const _isVisible = groupIndex === visibleGroupIndex;
        const nextGroupIsVisible = groupIndex === visibleGroupIndex + 1;

        return (
          <React.Fragment key={group.key}>
            {/* Group Header - Sticky */}
            <GroupHeader
              label={group.label}
              count={group.count}
              colSpan={columns}
              isSticky
              className={cn(
                'transition-opacity duration-150',
                // Fade out current header when next header approaches
                nextGroupIsVisible && 'opacity-50'
              )}
              ref={(el: HTMLTableRowElement | null) =>
                observeGroupHeader(group.key, el)
              }
            />

            {/* Group Rows */}
            {group.rows.map(row => {
              const rowElement = renderRow(row, globalRowIndex);
              globalRowIndex++;
              return rowElement;
            })}
          </React.Fragment>
        );
      })}
    </tbody>
  );
}

// Re-export React for Fragment
import React from 'react';
import { cn } from '../table.styles';
