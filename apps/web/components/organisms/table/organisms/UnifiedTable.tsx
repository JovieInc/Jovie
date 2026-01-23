'use client';

import {
  getCoreRowModel,
  getSortedRowModel,
  type Row,
  useReactTable,
} from '@tanstack/react-table';
import type { VirtualItem } from '@tanstack/react-virtual';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { useTableVirtualization } from '../hooks/useTableVirtualization';
import { GroupedTableBody } from '../molecules/GroupedTableBody';
import { LoadingTableBody } from '../molecules/LoadingTableBody';
import { TableContextMenu } from '../molecules/TableContextMenu';
import { TableHeaderCell } from '../molecules/TableHeaderCell';
import { UnifiedTableRow } from '../molecules/UnifiedTableRow';
import { cn, presets } from '../table.styles';
import type { UnifiedTableProps } from '../types/unified-table.types';
import { useTableGrouping } from '../utils/useTableGrouping';

// Re-export types for backwards compatibility
export type { UnifiedTableProps } from '../types/unified-table.types';

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

  // Initialize virtualization
  const {
    virtualRows,
    totalSize,
    paddingTop,
    paddingBottom,
    isVirtualized,
    measureElement,
  } = useTableVirtualization({
    rowCount: rows.length,
    containerRef: tableContainerRef,
    rowHeight,
    overscan,
    enabled: shouldVirtualize,
  });

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

  // Render table header
  const renderTableHeader = () => (
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
  );

  // Render a single row with optional context menu
  const renderRowWithContextMenu = (
    row: Row<TData>,
    rowIndex: number,
    virtualItem?: VirtualItem
  ) => {
    const rowData = row.original as TData;

    // Custom row renderer
    if (renderRow) {
      return renderRow(rowData, rowIndex);
    }

    // Default row renderer using memoized UnifiedTableRow
    const rowElement = (
      <UnifiedTableRow
        key={row.id}
        row={row}
        rowIndex={rowIndex}
        rowRefsMap={rowRefs.current}
        shouldEnableKeyboardNav={shouldEnableKeyboardNav}
        shouldVirtualize={isVirtualized}
        virtualStart={virtualItem?.start}
        focusedIndex={focusedIndex}
        onRowClick={onRowClick}
        onRowContextMenu={onRowContextMenu}
        onKeyDown={handleKeyDown}
        onFocusChange={setFocusedIndex}
        getRowClassName={getRowClassName}
        measureElement={measureElement}
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
  };

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
          {renderTableHeader()}
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
          {renderTableHeader()}
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
    // Build row lookup map once for O(1) lookups: O(n)
    const rowMap = new Map(
      table
        .getRowModel()
        .rows.map(r => [getRowId ? getRowId(r.original) : r.original, r])
    );

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
          {renderTableHeader()}
          <GroupedTableBody
            groupedData={groupedData}
            observeGroupHeader={observeGroupHeader}
            visibleGroupIndex={visibleGroupIndex}
            columns={columns.length}
            renderRow={(item, index) => {
              const row = rowMap.get(getRowId ? getRowId(item) : item);
              if (!row) return null;
              return renderRowWithContextMenu(row, index);
            }}
          />
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
        {renderTableHeader()}
        <tbody
          style={{
            position: isVirtualized ? 'relative' : undefined,
            height: isVirtualized ? `${totalSize}px` : undefined,
          }}
        >
          {/* Top padding for virtualization */}
          {isVirtualized && paddingTop > 0 && (
            <tr>
              <td style={{ height: `${paddingTop}px` }} />
            </tr>
          )}

          {/* Rows */}
          {(isVirtualized ? virtualRows : rows).map((item, listIndex) => {
            let row: Row<TData>;
            let virtualItem: VirtualItem | undefined;
            let rowIndex: number;

            if (isVirtualized) {
              virtualItem = item as VirtualItem;
              row = rows[virtualItem.index]!;
              rowIndex = virtualItem.index;
            } else {
              row = item as Row<TData>;
              rowIndex = listIndex;
            }

            return renderRowWithContextMenu(row, rowIndex, virtualItem);
          })}

          {/* Bottom padding for virtualization */}
          {isVirtualized && paddingBottom > 0 && (
            <tr>
              <td style={{ height: `${paddingBottom}px` }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
