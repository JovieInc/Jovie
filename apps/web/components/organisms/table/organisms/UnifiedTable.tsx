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
import { GroupedTableBody } from '../molecules/GroupedTableBody';
import { LoadingTableBody } from '../molecules/LoadingTableBody';
import {
  type ContextMenuItemType,
  TableContextMenu,
} from '../molecules/TableContextMenu';
import { TableHeaderCell } from '../molecules/TableHeaderCell';
import { cn, presets } from '../table.styles';
import { useTableGrouping } from '../utils/useTableGrouping';

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

  /**
   * Optional grouping configuration
   * When provided, table will render with grouped rows and sticky group headers
   */
  groupingConfig?: {
    getGroupKey: (row: TData) => string;
    getGroupLabel: (key: string) => string;
  };
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
  groupingConfig,
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

  const groupingEnabled = Boolean(groupingConfig);
  const groupingSourceData = useMemo(
    () => (groupingEnabled ? rows.map(r => r.original) : []),
    [groupingEnabled, rows]
  );

  // Initialize grouping (uses TanStack-sorted row order)
  const { groupedData, observeGroupHeader, visibleGroupIndex } =
    useTableGrouping({
      data: groupingSourceData,
      getGroupKey: groupingConfig?.getGroupKey ?? (() => ''),
      getGroupLabel: groupingConfig?.getGroupLabel ?? (key => key),
      enabled: groupingEnabled,
    });

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
          <thead>
            <tr>
              {table.getHeaderGroups()[0]?.headers.map(header => (
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
          </thead>

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
          <thead>
            <tr>
              {table.getHeaderGroups()[0]?.headers.map(header => (
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
          </thead>

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

  // Render grouped table if grouping is enabled
  if (groupingConfig && groupedData.length > 0) {
    return (
      <div ref={tableContainerRef} className='overflow-auto'>
        <table
          className={cn(
            'w-full border-separate border-spacing-0 text-[13px]',
            className
          )}
          style={{ minWidth }}
        >
          <caption className='sr-only'>Grouped table data</caption>

          {/* Header */}
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
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

          {/* Grouped Body */}
          {(() => {
            // Build row lookup map once for O(1) lookups: O(n)
            const rowMap = new Map(
              table
                .getRowModel()
                .rows.map(r => [
                  getRowId ? getRowId(r.original) : r.original,
                  r,
                ])
            );

            return (
              <GroupedTableBody
                groupedData={groupedData}
                observeGroupHeader={observeGroupHeader}
                visibleGroupIndex={visibleGroupIndex}
                columns={columns.length}
                renderRow={(item, index) => {
                  const row = rowMap.get(getRowId ? getRowId(item) : item);
                  if (!row) return null;

                  const rowData = row.original as TData;

                  // Build row element
                  const rowElement = (
                    <tr
                      key={row.id}
                      className={cn(
                        presets.tableRow,
                        onRowClick && 'cursor-pointer',
                        getRowClassName?.(rowData, index)
                      )}
                      onClick={() => onRowClick?.(rowData)}
                      onContextMenu={e => onRowContextMenu?.(rowData, e)}
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
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  );

                  // Wrap with context menu if provided
                  if (getContextMenuItems) {
                    const contextMenuItems = getContextMenuItems(rowData);
                    return (
                      <TableContextMenu key={row.id} items={contextMenuItems}>
                        {rowElement}
                      </TableContextMenu>
                    );
                  }

                  return rowElement;
                }}
              />
            );
          })()}
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
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
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
            // When virtualized, item is VirtualItem and we need to get the actual row
            // When not virtualized, item IS the row
            let row: Row<TData>;
            let virtualItem: VirtualItem | undefined;
            let rowIndex: number;

            if (shouldVirtualize) {
              virtualItem = item as VirtualItem;
              row = rows[virtualItem.index]!;
              rowIndex = virtualItem.index;
            } else {
              row = item as Row<TData>;
              rowIndex = listIndex;
            }

            const rowData = row.original as TData;

            // Custom row renderer
            if (renderRow) {
              return renderRow(rowData, rowIndex);
            }

            // Default row renderer
            const rowElement = (
              <tr
                key={row.id}
                ref={
                  shouldVirtualize ? rowVirtualizer.measureElement : undefined
                }
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
            );

            // Wrap with context menu if provided
            if (getContextMenuItems) {
              const contextMenuItems = getContextMenuItems(rowData);
              return (
                <TableContextMenu key={row.id} items={contextMenuItems}>
                  {rowElement}
                </TableContextMenu>
              );
            }

            return rowElement;
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
