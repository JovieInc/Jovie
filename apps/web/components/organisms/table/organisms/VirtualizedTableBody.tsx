'use client';

// @coverage-via apps/web/tests/unit/organisms/table/VirtualizedTableBody.test.tsx

import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import React from 'react';
import type { Row, RowData, VisibilityState } from '@/lib/tanstack-table';
import { COLUMN_SNAP_STAGGER_CAP } from '../column-snap';
import {
  type ContextMenuItemType,
  TableContextMenu,
} from '../molecules/TableContextMenu';
import { VirtualizedTableRow } from './VirtualizedTableRow';

export interface VirtualizedTableBodyProps<TData extends RowData> {
  /**
   * Table rows from TanStack Table
   */
  readonly rows: Row<TData>[];

  /**
   * Explicit compiler invalidation: TanStack rows retain identity when columns
   * change. This prop makes the parent recreate the body; the body deliberately
   * reads visible cells without compiler memoization.
   */
  readonly columnVisibility?: VisibilityState;

  /**
   * Whether virtualization is enabled
   */
  readonly shouldVirtualize: boolean;

  /**
   * Virtual rows from TanStack Virtual (when virtualization is enabled)
   */
  readonly virtualRows?: VirtualItem[];

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
  readonly getContextMenuItems?: (
    row: TData
  ) => ContextMenuItemType[] | Promise<ContextMenuItemType[]>;
  readonly contextMenuSearchable?: boolean;
  readonly contextMenuSearchPlaceholder?: string;
  readonly contextMenuSearchMode?: 'root' | 'recursive';

  /**
   * Get custom class names for a row
   */
  readonly getRowClassName?: (row: TData, index: number) => string;

  /**
   * Consumer-owned selected state for rows that do not use TanStack checkbox
   * selection (for example, a row that owns an open details rail).
   */
  readonly isRowSelected?: (row: TData, index: number) => boolean;

  /**
   * Get a stable test ID for a row when callers need selector-level targeting.
   */
  readonly getRowTestId?: (row: TData, index: number) => string | undefined;

  /**
   * Called when the row is shift-clicked (for range selection).
   * @param rowIndex - The index of the clicked row
   * @param rowData  - The data of the clicked row
   */
  readonly onRowShiftClick?: (rowIndex: number, rowData: TData) => void;

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

  /**
   * Layout-snap painted rows when columns appear or disappear.
   * @default false
   */
  readonly columnSnap?: boolean;
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
export function VirtualizedTableBody<TData extends RowData>({
  rows,
  shouldVirtualize,
  virtualRows,
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
  onRowShiftClick,
  getContextMenuItems,
  contextMenuSearchable = false,
  contextMenuSearchPlaceholder,
  contextMenuSearchMode = 'root',
  getRowClassName,
  isRowSelected,
  getRowTestId,
  renderRow,
  getRowId,
  expandedRowIds,
  renderExpandedContent,
  getExpandableRowId,
  columnCount,
  columnSnap = false,
}: VirtualizedTableBodyProps<TData>) {
  'use no memo';
  // Row identity is stable across visibility changes; read fresh visible cells.
  // Determine which items to iterate over.
  // Fall back to non-virtualized rendering if virtualizer hasn't produced items yet
  // (can happen when the scroll container hasn't been measured by ResizeObserver).
  const useVirtual = shouldVirtualize && (virtualRows?.length ?? 0) > 0;
  const items = useVirtual ? virtualRows! : rows;

  return (
    // Virtualized rows stay in normal table flow between the top and bottom
    // spacer rows. Absolutely positioned rows need <tbody> as their containing
    // block, and WebKit never makes a table row group one: rows escaped to the
    // page origin and painted over the page chrome in Safari.
    <tbody>
      {/* Top padding for virtualization */}
      {useVirtual && paddingTop !== undefined && paddingTop > 0 && (
        <tr>
          <td style={{ height: `${paddingTop}px` }} />
        </tr>
      )}

      {/* Rows */}
      {items.map((item, listIndex) => {
        // Extract row data based on virtualization mode
        let virtualItem: VirtualItem | undefined;
        let rowIndex = listIndex;
        let row: Row<TData> | undefined;

        if (useVirtual) {
          virtualItem = item as VirtualItem; // NOSONAR - narrowing union type
          rowIndex = virtualItem.index;
          row = rows[virtualItem.index];
        } else {
          row = item as Row<TData>;
        }

        // Virtual items can briefly reference a stale index while data is shrinking.
        // Skip rendering this item and let the next virtualizer pass reconcile indices.
        if (!row) {
          return null;
        }

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
            visibleCells={row.getVisibleCells()}
            rowIndex={rowIndex}
            rowRefsMap={rowRefsMap}
            shouldEnableKeyboardNav={shouldEnableKeyboardNav}
            shouldVirtualize={useVirtual}
            isFocused={focusedIndex === rowIndex}
            isSelected={isRowSelected?.(rowData, rowIndex)}
            onRowClick={onRowClick}
            onRowContextMenu={onRowContextMenu}
            onKeyDown={onKeyDown}
            onFocusChange={onFocusChange}
            getRowClassName={getRowClassName}
            getRowTestId={getRowTestId}
            measureElement={rowVirtualizer?.measureElement}
            onRowShiftClick={onRowShiftClick}
            columnSnap={columnSnap}
            // Rows past the stagger cap share one delay; capping the prop keeps
            // memoized rows stable while the virtual window scrolls.
            columnSnapOrder={Math.min(listIndex, COLUMN_SNAP_STAGGER_CAP)}
          />
        );

        // Apply context menu wrapper if needed
        const wrappedRow = getContextMenuItems ? (
          <TableContextMenu
            key={row.id}
            getItems={() => getContextMenuItems(rowData)}
            searchable={contextMenuSearchable}
            searchPlaceholder={contextMenuSearchPlaceholder}
            searchMode={contextMenuSearchMode}
          >
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
            <tr>
              <td colSpan={columnCount} className='p-0'>
                {expandedContent}
              </td>
            </tr>
          </React.Fragment>
        );
      })}

      {/* Bottom padding for virtualization */}
      {useVirtual && paddingBottom !== undefined && paddingBottom > 0 && (
        <tr>
          <td style={{ height: `${paddingBottom}px` }} />
        </tr>
      )}
    </tbody>
  );
}
