'use client';

import type { Row } from '@tanstack/react-table';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import React from 'react';
import {
  type ContextMenuItemType,
  TableContextMenu,
} from '../molecules/TableContextMenu';
import { VirtualizedTableRow } from './VirtualizedTableRow';

export interface VirtualizedTableBodyProps<TData> {
  /**
   * Table rows from TanStack Table
   */
  readonly rows: Row<TData>[];

  /**
   * Whether virtualization is enabled
   */
  readonly shouldVirtualize: boolean;

  /**
   * Virtual rows from TanStack Virtual (when virtualization is enabled)
   */
  readonly virtualRows?: VirtualItem[];

  /**
   * Total height of virtualized content
   */
  readonly totalSize?: number;

  /**
   * Top padding for virtualization
   */
  readonly paddingTop?: number;

  /**
   * Bottom padding for virtualization
   */
  readonly paddingBottom?: number;

  /**
   * Row virtualizer for measuring elements
   */
  readonly rowVirtualizer?: Virtualizer<HTMLDivElement, Element>;

  /**
   * Map of row refs for keyboard navigation
   */
  readonly rowRefsMap: Map<number, HTMLTableRowElement>;

  /**
   * Whether keyboard navigation is enabled
   */
  readonly shouldEnableKeyboardNav: boolean;

  /**
   * Currently focused row index
   */
  readonly focusedIndex: number;

  /**
   * Callback when focus changes
   */
  readonly onFocusChange: (index: number) => void;

  /**
   * Click handler for row
   */
  readonly onRowClick?: (row: TData) => void;

  /**
   * Context menu handler for row
   */
  readonly onRowContextMenu?: (row: TData, event: React.MouseEvent) => void;

  /**
   * Keyboard event handler
   */
  readonly onKeyDown: (
    event: React.KeyboardEvent,
    rowIndex: number,
    rowData: TData
  ) => void;

  /**
   * Get context menu items for a row
   */
  readonly getContextMenuItems?: (row: TData) => ContextMenuItemType[];

  /**
   * Get custom class names for a row
   */
  readonly getRowClassName?: (row: TData, index: number) => string;

  /**
   * Custom row renderer
   */
  readonly renderRow?: (row: TData, index: number) => React.ReactNode;

  /**
   * Get unique row ID
   */
  readonly getRowId?: (row: TData) => string;

  /**
   * Set of expanded row IDs for expandable rows
   */
  readonly expandedRowIds?: Set<string>;

  /**
   * Renders content to display below an expanded row
   */
  readonly renderExpandedContent?: (
    row: TData,
    columnCount: number
  ) => React.ReactNode;

  /**
   * Callback to get the row ID for expansion tracking
   */
  readonly getExpandableRowId?: (row: TData) => string;

  /**
   * Number of columns (for expanded content spanning)
   */
  readonly columnCount: number;
}

/**
 * VirtualizedTableBody - Table body with virtualization support
 *
 * Features:
 * - TanStack Virtual integration for large datasets
 * - Keyboard navigation support
 * - Context menu support
 * - Expandable rows support
 * - Custom row rendering
 *
 * Example:
 * ```tsx
 * <VirtualizedTableBody
 *   rows={table.getRowModel().rows}
 *   shouldVirtualize={rows.length > 20}
 *   virtualRows={virtualRows}
 *   rowRefsMap={rowRefs.current}
 *   // ... other props
 * />
 * ```
 */
export function VirtualizedTableBody<TData>({
  rows,
  shouldVirtualize,
  virtualRows,
  totalSize,
  paddingTop,
  paddingBottom,
  rowVirtualizer,
  rowRefsMap,
  shouldEnableKeyboardNav,
  focusedIndex,
  onFocusChange,
  onRowClick,
  onRowContextMenu,
  onKeyDown,
  getContextMenuItems,
  getRowClassName,
  renderRow,
  getRowId,
  expandedRowIds,
  renderExpandedContent,
  getExpandableRowId,
  columnCount,
}: VirtualizedTableBodyProps<TData>) {
  // Determine which items to iterate over
  const items = shouldVirtualize && virtualRows ? virtualRows : rows;

  return (
    <tbody
      style={{
        position: shouldVirtualize ? 'relative' : undefined,
        height: shouldVirtualize && totalSize ? `${totalSize}px` : undefined,
      }}
    >
      {/* Top padding for virtualization */}
      {shouldVirtualize && paddingTop !== undefined && paddingTop > 0 && (
        <tr>
          <td style={{ height: `${paddingTop}px` }} />
        </tr>
      )}

      {/* Rows */}
      {items.map((item, listIndex) => {
        // Extract row data based on virtualization mode
        const { row, virtualItem, rowIndex } = shouldVirtualize
          ? {
              virtualItem: item as VirtualItem,
              row: rows[(item as VirtualItem).index]!,
              rowIndex: (item as VirtualItem).index,
            }
          : {
              virtualItem: undefined,
              row: item as Row<TData>,
              rowIndex: listIndex,
            };

        const rowData = row.original as TData;

        // Early return for custom row renderer
        if (renderRow) {
          return renderRow(rowData, rowIndex);
        }

        // Build base row element
        const rowElement = (
          <VirtualizedTableRow
            key={row.id}
            row={row}
            rowIndex={rowIndex}
            rowRefsMap={rowRefsMap}
            shouldEnableKeyboardNav={shouldEnableKeyboardNav}
            shouldVirtualize={shouldVirtualize}
            virtualStart={virtualItem?.start}
            focusedIndex={focusedIndex}
            onRowClick={onRowClick}
            onRowContextMenu={onRowContextMenu}
            onKeyDown={onKeyDown}
            onFocusChange={onFocusChange}
            getRowClassName={getRowClassName}
            measureElement={rowVirtualizer?.measureElement}
          />
        );

        // Apply context menu wrapper if needed
        const wrappedRow = getContextMenuItems ? (
          <TableContextMenu key={row.id} items={getContextMenuItems(rowData)}>
            {rowElement}
          </TableContextMenu>
        ) : (
          rowElement
        );

        // Check for expanded content
        const rowId = getExpandableRowId
          ? getExpandableRowId(rowData)
          : (getRowId?.(rowData) ?? row.id);
        const isExpanded = expandedRowIds?.has(rowId);

        // Early return if no expanded content
        if (!isExpanded || !renderExpandedContent) {
          return wrappedRow;
        }

        // Render row with expanded content
        const expandedContent = renderExpandedContent(rowData, columnCount);
        return (
          <React.Fragment key={row.id}>
            {wrappedRow}
            {expandedContent}
          </React.Fragment>
        );
      })}

      {/* Bottom padding for virtualization */}
      {shouldVirtualize && paddingBottom !== undefined && paddingBottom > 0 && (
        <tr>
          <td style={{ height: `${paddingBottom}px` }} />
        </tr>
      )}
    </tbody>
  );
}
