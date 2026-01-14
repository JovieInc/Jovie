'use client';

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import React, { useCallback, useMemo, useRef } from 'react';
import { LoadingTableBody } from '../molecules/LoadingTableBody';
import {
  type ContextMenuItemType,
  TableContextMenu,
} from '../molecules/TableContextMenu';
import { cn, presets } from '../table.styles';
import { UnifiedTableHeader } from './UnifiedTableHeader';

export interface UnifiedTableProps<TData> {
  /**
   * Table data
   */
  data: TData[];

  /**
   * Column definitions (TanStack Table format)
   */
  columns: ColumnDef<TData, unknown>[];

  /**
   * Loading state
   */
  isLoading?: boolean;

  /**
   * Empty state component
   */
  emptyState?: React.ReactNode;

  /**
   * Row selection state (controlled)
   */
  rowSelection?: RowSelectionState;

  /**
   * Row selection change handler
   */
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  /**
   * Sorting state (controlled)
   */
  sorting?: SortingState;

  /**
   * Sorting change handler
   */
  onSortingChange?: OnChangeFn<SortingState>;

  /**
   * Enable virtualization for large datasets
   * @default true for 20+ rows
   */
  enableVirtualization?: boolean;

  /**
   * Estimated row height for virtualization
   * @default 52
   */
  rowHeight?: number;

  /**
   * Number of rows to render above/below viewport
   * @default 5
   */
  overscan?: number;

  /**
   * Custom row renderer
   */
  renderRow?: (row: TData, index: number) => React.ReactNode;

  /**
   * Get unique row ID
   */
  getRowId?: (row: TData) => string;

  /**
   * Click handler for row
   */
  onRowClick?: (row: TData) => void;

  /**
   * Context menu handler for row
   */
  onRowContextMenu?: (row: TData, event: React.MouseEvent) => void;

  /**
   * Get context menu items for a row
   */
  getContextMenuItems?: (row: TData) => ContextMenuItemType[];

  /**
   * Get custom class names for a row
   */
  getRowClassName?: (row: TData, index: number) => string;

  /**
   * Additional table class names
   */
  className?: string;

  /**
   * Min width for table (prevents column squishing)
   */
  minWidth?: string;

  /**
   * Number of skeleton rows to show when loading
   * @default 20
   */
  skeletonRows?: number;
}

/**
 * UnifiedTable - TanStack Table wrapper with virtualization and atomic design
 *
 * Features:
 * - TanStack Table integration for powerful table features
 * - TanStack Virtual for performance with large datasets
 * - Loading skeletons with no layout shift
 * - Row selection, sorting, filtering
 * - Perfect vertical alignment
 * - Linear.app-inspired design
 *
 * Example:
 * ```tsx
 * const columns: ColumnDef<User>[] = [
 *   {
 *     id: 'select',
 *     header: ({ table }) => <TableCheckboxCell table={table} />,
 *     cell: ({ row }) => <TableCheckboxCell row={row} />,
 *   },
 *   {
 *     accessorKey: 'name',
 *     header: 'Name',
 *     cell: ({ row }) => <span>{row.original.name}</span>,
 *   },
 * ];
 *
 * <UnifiedTable
 *   data={users}
 *   columns={columns}
 *   isLoading={isLoading}
 *   rowSelection={rowSelection}
 *   onRowSelectionChange={setRowSelection}
 * />
 * ```
 */
export function UnifiedTable<TData>({
  data,
  columns,
  isLoading = false,
  emptyState,
  rowSelection,
  onRowSelectionChange,
  sorting,
  onSortingChange,
  enableVirtualization,
  rowHeight = 52,
  overscan = 5,
  renderRow,
  getRowId,
  onRowClick,
  onRowContextMenu,
  getContextMenuItems,
  getRowClassName,
  className,
  minWidth = '960px',
  skeletonRows = 20,
}: UnifiedTableProps<TData>) {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Auto-enable virtualization for 20+ rows
  const shouldVirtualize =
    enableVirtualization ?? (data.length >= 20 && !isLoading);

  // Initialize TanStack Table
  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection,
      sorting,
    },
    onRowSelectionChange,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
    enableRowSelection: !!onRowSelectionChange,
  });

  const { rows } = table.getRowModel();

  // Initialize virtualizer
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: useCallback(() => rowHeight, [rowHeight]),
    overscan,
    enabled: shouldVirtualize,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Padding for virtualized rows
  const paddingTop =
    shouldVirtualize && virtualRows.length > 0
      ? (virtualRows[0]?.start ?? 0)
      : 0;
  const paddingBottom =
    shouldVirtualize && virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  // Calculate column count for skeleton
  const columnCount = useMemo(() => columns.length, [columns]);

  const getRowDetails = useCallback(
    (item: Row<TData> | VirtualItem, listIndex: number) => {
      if (!shouldVirtualize) {
        return {
          row: item as Row<TData>,
          rowIndex: listIndex,
          virtualItem: undefined,
        };
      }

      const virtualItem = item as VirtualItem;
      const row = rows[virtualItem.index]!;

      return {
        row,
        rowIndex: virtualItem.index,
        virtualItem,
      };
    },
    [rows, shouldVirtualize]
  );

  const renderRowElement = useCallback(
    (
      row: Row<TData>,
      rowData: TData,
      rowIndex: number,
      virtualItem?: VirtualItem
    ) => (
      <tr
        key={row.id}
        ref={shouldVirtualize ? rowVirtualizer.measureElement : undefined}
        data-index={rowIndex}
        className={cn(
          presets.tableRow,
          onRowClick && 'cursor-pointer',
          getRowClassName?.(rowData, rowIndex)
        )}
        onClick={() => onRowClick?.(rowData)}
        onContextMenu={e => onRowContextMenu?.(rowData, e)}
        style={
          shouldVirtualize && virtualItem
            ? {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }
            : undefined
        }
      >
        {row.getVisibleCells().map(cell => (
          <td
            key={cell.id}
            className={presets.tableCell}
            style={{
              width:
                cell.column.getSize() !== 150
                  ? cell.column.getSize()
                  : undefined,
            }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    ),
    [
      getRowClassName,
      onRowClick,
      onRowContextMenu,
      rowVirtualizer.measureElement,
      shouldVirtualize,
    ]
  );

  const renderTableRow = useCallback(
    (rowData: TData, rowId: string, rowElement: React.ReactNode) => {
      if (!getContextMenuItems) {
        return rowElement;
      }

      const contextMenuItems = getContextMenuItems(rowData);

      return (
        <TableContextMenu key={rowId} items={contextMenuItems}>
          {rowElement}
        </TableContextMenu>
      );
    },
    [getContextMenuItems]
  );

  // Loading state
  if (isLoading) {
    return (
      <div ref={tableContainerRef} className='overflow-auto'>
        <table
          className={cn(
            'w-full border-separate border-spacing-0 text-[13px]',
            className
          )}
          style={{ minWidth }}
        >
          <caption className='sr-only'>Loading table data</caption>

          {/* Header */}
          <UnifiedTableHeader
            headerGroups={table.getHeaderGroups()}
            variant='loading'
          />

          {/* Loading skeleton */}
          <LoadingTableBody
            rows={skeletonRows}
            columns={columnCount}
            rowHeight={`${rowHeight}px`}
          />
        </table>
      </div>
    );
  }

  // Empty state
  if (rows.length === 0 && emptyState) {
    return (
      <div ref={tableContainerRef} className='overflow-auto'>
        <table
          className={cn(
            'w-full border-separate border-spacing-0 text-[13px]',
            className
          )}
          style={{ minWidth }}
        >
          <caption className='sr-only'>Empty table</caption>

          {/* Header */}
          <UnifiedTableHeader
            headerGroups={table.getHeaderGroups()}
            variant='standard'
          />

          {/* Empty state */}
          <tbody>
            <tr>
              <td colSpan={columnCount} className='p-0'>
                {emptyState}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // Render table with data
  return (
    <div ref={tableContainerRef} className='overflow-auto'>
      <table
        className={cn(
          'w-full border-separate border-spacing-0 text-[13px]',
          className
        )}
        style={{ minWidth }}
      >
        <caption className='sr-only'>Data table</caption>

        {/* Header */}
        <UnifiedTableHeader
          headerGroups={table.getHeaderGroups()}
          variant='standard'
        />

        {/* Body */}
        <tbody
          style={{
            position: shouldVirtualize ? 'relative' : undefined,
            height: shouldVirtualize ? `${totalSize}px` : undefined,
          }}
        >
          {/* Top padding for virtualization */}
          {shouldVirtualize && paddingTop > 0 && (
            <tr>
              <td style={{ height: `${paddingTop}px` }} />
            </tr>
          )}

          {/* Rows */}
          {(shouldVirtualize ? virtualRows : rows).map((item, listIndex) => {
            const { row, rowIndex, virtualItem } = getRowDetails(
              item,
              listIndex
            );
            const rowData = row.original as TData;

            if (renderRow) {
              return renderRow(rowData, rowIndex);
            }

            const rowElement = renderRowElement(
              row,
              rowData,
              rowIndex,
              virtualItem
            );

            return renderTableRow(rowData, row.id, rowElement);
          })}

          {/* Bottom padding for virtualization */}
          {shouldVirtualize && paddingBottom > 0 && (
            <tr>
              <td style={{ height: `${paddingBottom}px` }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
