'use client';

import {
  type ColumnDef,
  type ColumnPinningState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { GroupedTableBody } from '../molecules/GroupedTableBody';
import { LoadingTableBody } from '../molecules/LoadingTableBody';
import {
  type ContextMenuItemType,
  TableContextMenu,
} from '../molecules/TableContextMenu';
import { cn } from '../table.styles';
import { useTableGrouping } from '../utils/useTableGrouping';
import { UnifiedTableHeader } from './UnifiedTableHeader';
import { useTableKeyboardNav } from './useTableKeyboardNav';
import { useTableVirtualization } from './useTableVirtualization';
import { VirtualizedTableBody } from './VirtualizedTableBody';
import { VirtualizedTableRow } from './VirtualizedTableRow';

export interface UnifiedTableProps<TData> {
  /**
   * Table data
   */
  readonly data: TData[];

  /**
   * Column definitions (TanStack Table format)
   */
  readonly columns: ColumnDef<TData, unknown>[];

  /**
   * Loading state
   */
  readonly isLoading?: boolean;

  /**
   * Empty state component
   */
  readonly emptyState?: React.ReactNode;

  /**
   * Row selection state (controlled)
   */
  readonly rowSelection?: RowSelectionState;

  /**
   * Row selection change handler
   */
  readonly onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  /**
   * Sorting state (controlled)
   */
  readonly sorting?: SortingState;

  /**
   * Sorting change handler
   */
  readonly onSortingChange?: OnChangeFn<SortingState>;

  /**
   * Enable virtualization for large datasets
   * @default true for 20+ rows
   */
  readonly enableVirtualization?: boolean;

  /**
   * Estimated row height for virtualization
   * @default 44
   */
  readonly rowHeight?: number;

  /**
   * Number of rows to render above/below viewport
   * @default 5
   */
  readonly overscan?: number;

  /**
   * Custom row renderer
   */
  readonly renderRow?: (row: TData, index: number) => React.ReactNode;

  /**
   * Get unique row ID
   */
  readonly getRowId?: (row: TData) => string;

  /**
   * Click handler for row
   */
  readonly onRowClick?: (row: TData) => void;

  /**
   * Context menu handler for row
   */
  readonly onRowContextMenu?: (row: TData, event: React.MouseEvent) => void;

  /**
   * Get context menu items for a row
   */
  readonly getContextMenuItems?: (row: TData) => ContextMenuItemType[];

  /**
   * Get custom class names for a row
   */
  readonly getRowClassName?: (row: TData, index: number) => string;

  /**
   * Additional table class names
   */
  readonly className?: string;

  /**
   * Additional container class names (applied to scroll container)
   */
  readonly containerClassName?: string;

  /**
   * Min width for table (prevents column squishing)
   */
  readonly minWidth?: string;

  /**
   * Number of skeleton rows to show when loading
   * @default 20
   */
  readonly skeletonRows?: number;

  /**
   * Optional grouping configuration
   * When provided, table will render with grouped rows and sticky group headers
   */
  readonly groupingConfig?: {
    getGroupKey: (row: TData) => string;
    readonly getGroupLabel: (key: string) => string;
  };

  /**
   * Enable keyboard navigation (arrow keys to move, Enter to select)
   * @default true when onRowClick is provided
   */
  readonly enableKeyboardNavigation?: boolean;

  /**
   * Currently focused row index (controlled)
   */
  readonly focusedRowIndex?: number;

  /**
   * Callback when focused row changes via keyboard
   */
  readonly onFocusedRowChange?: (index: number) => void;

  /**
   * Global filter value for client-side filtering
   */
  readonly globalFilter?: string;

  /**
   * Callback when global filter changes
   */
  readonly onGlobalFilterChange?: OnChangeFn<string>;

  /**
   * Enable client-side filtering
   * @default false
   */
  readonly enableFiltering?: boolean;

  /**
   * Column pinning configuration
   * Pin columns to left or right edges so they're always visible when scrolling
   * @example { left: ['select'], right: ['actions'] }
   */
  readonly columnPinning?: ColumnPinningState;

  /**
   * Enable column pinning
   * @default false
   */
  readonly enablePinning?: boolean;

  /**
   * Column visibility state (controlled)
   * Maps column ID to visibility boolean
   */
  readonly columnVisibility?: VisibilityState;

  /**
   * Column visibility change handler
   */
  readonly onColumnVisibilityChange?: OnChangeFn<VisibilityState>;

  /**
   * Set of expanded row IDs for expandable rows.
   * When provided with renderExpandedContent, enables row expansion.
   */
  readonly expandedRowIds?: Set<string>;

  /**
   * Renders content to display below an expanded row.
   * Return null to show nothing, or React nodes for the expanded content.
   * The content is rendered as additional <tr> elements.
   * @param row - The row data
   * @param columnCount - Number of columns for proper spanning
   */
  readonly renderExpandedContent?: (
    row: TData,
    columnCount: number
  ) => React.ReactNode;

  /**
   * Callback to get the row ID for expansion tracking.
   * Required when using expandedRowIds.
   * Falls back to getRowId if not provided.
   */
  readonly getExpandableRowId?: (row: TData) => string;
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
  rowHeight = 44,
  overscan = 5,
  renderRow,
  getRowId,
  onRowClick,
  onRowContextMenu,
  getContextMenuItems,
  getRowClassName,
  className,
  containerClassName,
  minWidth = `${TABLE_MIN_WIDTHS.MEDIUM}px`,
  skeletonRows = 20,
  groupingConfig,
  enableKeyboardNavigation,
  focusedRowIndex: controlledFocusedIndex,
  onFocusedRowChange,
  globalFilter,
  onGlobalFilterChange,
  enableFiltering = false,
  columnPinning,
  enablePinning = false,
  columnVisibility,
  onColumnVisibilityChange,
  expandedRowIds,
  renderExpandedContent,
  getExpandableRowId,
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

  // Check if any rows are expanded
  const hasExpandedRows = expandedRowIds && expandedRowIds.size > 0;

  // Auto-enable virtualization for 20+ rows
  // Disable virtualization when rows are expanded (dynamic heights)
  const shouldVirtualize =
    (enableVirtualization ?? (data.length >= 20 && !isLoading)) &&
    !hasExpandedRows;

  // Initialize TanStack Table
  // Memoize row model factories to prevent recreation
  const coreRowModel = useMemo(() => getCoreRowModel(), []);
  const sortedRowModel = useMemo(() => getSortedRowModel(), []);
  const filteredRowModel = useMemo(
    () => (enableFiltering ? getFilteredRowModel() : undefined),
    [enableFiltering]
  );

  // Build state object conditionally to avoid passing undefined values
  // that could cause TanStack Table to throw errors
  const tableState = useMemo(() => {
    const state: Record<string, unknown> = {};
    if (rowSelection !== undefined) state.rowSelection = rowSelection;
    if (sorting !== undefined) state.sorting = sorting;
    if (globalFilter !== undefined) state.globalFilter = globalFilter;
    if (columnPinning !== undefined) state.columnPinning = columnPinning;
    if (columnVisibility !== undefined)
      state.columnVisibility = columnVisibility;
    return state;
  }, [rowSelection, sorting, globalFilter, columnPinning, columnVisibility]);

  const table = useReactTable({
    data,
    columns,
    state: tableState,
    onRowSelectionChange,
    onSortingChange,
    onGlobalFilterChange,
    onColumnVisibilityChange,
    getCoreRowModel: coreRowModel,
    getSortedRowModel: sortedRowModel,
    getFilteredRowModel: filteredRowModel,
    getRowId,
    enableRowSelection: !!onRowSelectionChange,
    enableGlobalFilter: enableFiltering,
    enableColumnPinning: enablePinning,
    globalFilterFn: 'includesString',
  });

  const { rows } = table.getRowModel();

  const groupingEnabled = Boolean(groupingConfig);
  const groupingSourceData = useMemo(
    () => (groupingEnabled ? rows.map(r => r.original) : []),
    [groupingEnabled, rows]
  );

  // Stable fallback functions for grouping (prevents recreation on every render)
  const noopGetGroupKey = useCallback(() => '', []);
  const identityGetGroupLabel = useCallback((key: string) => key, []);

  // Initialize grouping (uses TanStack-sorted row order)
  const { groupedData, observeGroupHeader, visibleGroupIndex } =
    useTableGrouping({
      data: groupingSourceData,
      getGroupKey: groupingConfig?.getGroupKey ?? noopGetGroupKey,
      getGroupLabel: groupingConfig?.getGroupLabel ?? identityGetGroupLabel,
      enabled: groupingEnabled,
    });

  // Initialize virtualization
  const {
    virtualizer: rowVirtualizer,
    virtualRows,
    totalSize,
    paddingTop,
    paddingBottom,
  } = useTableVirtualization({
    rowCount: rows.length,
    scrollElementRef: tableContainerRef,
    estimatedRowHeight: rowHeight,
    overscan,
    enabled: shouldVirtualize,
  });

  // Initialize keyboard navigation
  const { handleKeyDown } = useTableKeyboardNav({
    enabled: shouldEnableKeyboardNav,
    focusedIndex,
    rowCount: rows.length,
    rowRefsMap: rowRefs.current,
    setFocusedIndex,
    onRowClick,
  });

  // Calculate column count for skeleton
  const columnCount = useMemo(() => columns.length, [columns]);

  // Common table styles
  const tableClassName = cn(
    'w-full border-separate border-spacing-0 text-[13px]',
    className
  );

  // Loading state
  if (isLoading) {
    return (
      <div
        ref={tableContainerRef}
        className={cn('overflow-auto', containerClassName)}
      >
        <table className={tableClassName} style={{ minWidth }}>
          <caption className='sr-only'>Loading table data</caption>
          <UnifiedTableHeader headerGroups={table.getHeaderGroups()} />
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
      <div
        ref={tableContainerRef}
        className={cn('overflow-auto', containerClassName)}
      >
        <table className={tableClassName} style={{ minWidth }}>
          <caption className='sr-only'>Empty table</caption>
          <UnifiedTableHeader headerGroups={table.getHeaderGroups()} />
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
      <div
        ref={tableContainerRef}
        className={cn('overflow-auto', containerClassName)}
      >
        <table className={tableClassName} style={{ minWidth }}>
          <caption className='sr-only'>Grouped table data</caption>
          <UnifiedTableHeader headerGroups={table.getHeaderGroups()} />
          <GroupedTableBody
            groupedData={groupedData}
            observeGroupHeader={observeGroupHeader}
            visibleGroupIndex={visibleGroupIndex}
            columns={columns.length}
            renderRow={(item, index) => {
              const row = rowMap.get(getRowId ? getRowId(item) : item);
              if (!row) return null;

              const rowData = row.original as TData;

              // Build row element using memoized VirtualizedTableRow
              const rowElement = (
                <VirtualizedTableRow
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

              // Check if row is expanded and has expanded content
              const rowId =
                getExpandableRowId?.(rowData) ?? getRowId?.(rowData) ?? row.id;
              const isExpanded = expandedRowIds?.has(rowId);
              const expandedContent =
                isExpanded && renderExpandedContent
                  ? renderExpandedContent(rowData, columns.length)
                  : null;

              // Wrap with context menu if provided
              const wrappedRowElement = getContextMenuItems ? (
                <TableContextMenu
                  key={row.id}
                  items={getContextMenuItems(rowData)}
                >
                  {rowElement}
                </TableContextMenu>
              ) : (
                rowElement
              );

              // If expanded, render both row and expanded content
              if (expandedContent) {
                return (
                  <React.Fragment key={row.id}>
                    {wrappedRowElement}
                    {expandedContent}
                  </React.Fragment>
                );
              }

              return wrappedRowElement;
            }}
          />
        </table>
      </div>
    );
  }

  // Render table with data
  return (
    <div
      ref={tableContainerRef}
      className={cn('overflow-auto', containerClassName)}
    >
      <table className={tableClassName} style={{ minWidth }}>
        <caption className='sr-only'>Data table</caption>
        <UnifiedTableHeader headerGroups={table.getHeaderGroups()} />
        <VirtualizedTableBody
          rows={rows}
          shouldVirtualize={shouldVirtualize}
          virtualRows={virtualRows}
          totalSize={totalSize}
          paddingTop={paddingTop}
          paddingBottom={paddingBottom}
          rowVirtualizer={rowVirtualizer}
          rowRefsMap={rowRefs.current}
          shouldEnableKeyboardNav={shouldEnableKeyboardNav}
          focusedIndex={focusedIndex}
          onFocusChange={setFocusedIndex}
          onRowClick={onRowClick}
          onRowContextMenu={onRowContextMenu}
          onKeyDown={handleKeyDown}
          getContextMenuItems={getContextMenuItems}
          getRowClassName={getRowClassName}
          renderRow={renderRow}
          getRowId={getRowId}
          expandedRowIds={expandedRowIds}
          renderExpandedContent={renderExpandedContent}
          getExpandableRowId={getExpandableRowId}
          columnCount={columnCount}
        />
      </table>
    </div>
  );
}
