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
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
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
   * @default 44
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

  /**
   * Enable keyboard navigation (arrow keys to move, Enter to select)
   * @default true when onRowClick is provided
   */
  enableKeyboardNavigation?: boolean;

  /**
   * Currently focused row index (controlled)
   */
  focusedRowIndex?: number;

  /**
   * Callback when focused row changes via keyboard
   */
  onFocusedRowChange?: (index: number) => void;
}

/**
 * Internal memoized row component to prevent inline handler recreation
 */
interface TableRowProps<TData> {
  row: Row<TData>;
  rowIndex: number;
  rowRefsMap: Map<number, HTMLTableRowElement>;
  shouldEnableKeyboardNav: boolean;
  shouldVirtualize: boolean;
  virtualStart?: number;
  focusedIndex: number;
  onRowClick?: (row: TData) => void;
  onRowContextMenu?: (row: TData, event: React.MouseEvent) => void;
  onKeyDown: (
    event: React.KeyboardEvent,
    rowIndex: number,
    rowData: TData
  ) => void;
  onFocusChange: (index: number) => void;
  getRowClassName?: (row: TData, index: number) => string;
  measureElement?: (el: HTMLTableRowElement | null) => void;
}

const TableRow = memo(function TableRow<TData>({
  row,
  rowIndex,
  rowRefsMap,
  shouldEnableKeyboardNav,
  shouldVirtualize,
  virtualStart,
  focusedIndex,
  onRowClick,
  onRowContextMenu,
  onKeyDown,
  onFocusChange,
  getRowClassName,
  measureElement,
}: TableRowProps<TData>) {
  const rowData = row.original as TData;

  const handleClick = useCallback(() => {
    onRowClick?.(rowData);
    onFocusChange(rowIndex);
  }, [onRowClick, rowData, onFocusChange, rowIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => onKeyDown(e, rowIndex, rowData),
    [onKeyDown, rowIndex, rowData]
  );

  const handleFocus = useCallback(() => {
    if (shouldEnableKeyboardNav) {
      onFocusChange(rowIndex);
    }
  }, [shouldEnableKeyboardNav, onFocusChange, rowIndex]);

  const handleMouseEnter = useCallback(() => {
    if (shouldEnableKeyboardNav) {
      onFocusChange(rowIndex);
    }
  }, [shouldEnableKeyboardNav, onFocusChange, rowIndex]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => onRowContextMenu?.(rowData, e),
    [onRowContextMenu, rowData]
  );

  const handleRef = useCallback(
    (el: HTMLTableRowElement | null) => {
      if (el) {
        rowRefsMap.set(rowIndex, el);
      } else {
        rowRefsMap.delete(rowIndex);
      }
      if (shouldVirtualize && el && measureElement) {
        measureElement(el);
      }
    },
    [rowRefsMap, rowIndex, shouldVirtualize, measureElement]
  );

  return (
    <tr
      key={row.id}
      ref={handleRef}
      data-index={rowIndex}
      tabIndex={shouldEnableKeyboardNav ? 0 : undefined}
      className={cn(
        presets.tableRow,
        onRowClick && 'cursor-pointer',
        shouldEnableKeyboardNav &&
          'focus-visible:outline-none focus-visible:bg-surface-2',
        focusedIndex === rowIndex && 'bg-surface-2',
        getRowClassName?.(rowData, rowIndex)
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
      onContextMenu={handleContextMenu}
      style={
        shouldVirtualize && virtualStart !== undefined
          ? {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualStart}px)`,
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
              cell.column.getSize() !== 150 ? cell.column.getSize() : undefined,
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}) as <TData>(props: TableRowProps<TData>) => React.ReactElement;

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
  rowHeight = 44,
  overscan = 5,
  renderRow,
  getRowId,
  onRowClick,
  onRowContextMenu,
  getContextMenuItems,
  getRowClassName,
  className,
  minWidth = `${TABLE_MIN_WIDTHS.MEDIUM}px`,
  skeletonRows = 20,
  groupingConfig,
  enableKeyboardNavigation,
  focusedRowIndex: controlledFocusedIndex,
  onFocusedRowChange,
}: UnifiedTableProps<TData>) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // Internal focused row state (uncontrolled mode)
  const [internalFocusedIndex, setInternalFocusedIndex] = useState<number>(-1);

  // Use controlled or uncontrolled focus
  const focusedIndex = controlledFocusedIndex ?? internalFocusedIndex;
  const setFocusedIndex = useCallback(
    (index: number) => {
      if (onFocusedRowChange) {
        onFocusedRowChange(index);
      } else {
        setInternalFocusedIndex(index);
      }
    },
    [onFocusedRowChange]
  );

  // Auto-enable keyboard nav when onRowClick is provided
  const shouldEnableKeyboardNav =
    enableKeyboardNavigation ?? Boolean(onRowClick);

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

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, rowIndex: number, rowData: TData) => {
      if (!shouldEnableKeyboardNav) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (rowIndex < rows.length - 1) {
            const nextIndex = rowIndex + 1;
            setFocusedIndex(nextIndex);
            rowRefs.current.get(nextIndex)?.focus();
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (rowIndex > 0) {
            const prevIndex = rowIndex - 1;
            setFocusedIndex(prevIndex);
            rowRefs.current.get(prevIndex)?.focus();
          }
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          onRowClick?.(rowData);
          break;
      }
    },
    [shouldEnableKeyboardNav, rows.length, setFocusedIndex, onRowClick]
  );

  // Scroll focused row into view when it changes
  useEffect(() => {
    if (focusedIndex >= 0 && shouldEnableKeyboardNav) {
      const rowElement = rowRefs.current.get(focusedIndex);
      rowElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex, shouldEnableKeyboardNav]);

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

                  // Build row element using memoized TableRow
                  const rowElement = (
                    <TableRow
                      key={row.id}
                      row={row}
                      rowIndex={index}
                      rowRefsMap={rowRefs.current}
                      shouldEnableKeyboardNav={shouldEnableKeyboardNav}
                      shouldVirtualize={false}
                      focusedIndex={focusedIndex}
                      onRowClick={onRowClick}
                      onRowContextMenu={onRowContextMenu}
                      onKeyDown={handleKeyDown}
                      onFocusChange={setFocusedIndex}
                      getRowClassName={getRowClassName}
                    />
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

            // Default row renderer using memoized TableRow
            const rowElement = (
              <TableRow
                key={row.id}
                row={row}
                rowIndex={rowIndex}
                rowRefsMap={rowRefs.current}
                shouldEnableKeyboardNav={shouldEnableKeyboardNav}
                shouldVirtualize={shouldVirtualize}
                virtualStart={virtualItem?.start}
                focusedIndex={focusedIndex}
                onRowClick={onRowClick}
                onRowContextMenu={onRowContextMenu}
                onKeyDown={handleKeyDown}
                onFocusChange={setFocusedIndex}
                getRowClassName={getRowClassName}
                measureElement={rowVirtualizer.measureElement}
              />
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
