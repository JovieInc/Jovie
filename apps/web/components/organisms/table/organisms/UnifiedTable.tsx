'use client';

import {
  type ColumnDef,
  type ColumnPinningState,
  type FilterFn,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
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
   * @default 32
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
   * Called when the row is shift-clicked (for range selection).
   * The consumer should call rangeSelect from useRowSelection.
   * @param rowIndex - The index of the clicked row
   * @param rowData  - The row data
   */
  readonly onRowShiftClick?: (rowIndex: number, rowData: TData) => void;

  /**
   * Context menu handler for row
   */
  readonly onRowContextMenu?: (row: TData, event: React.MouseEvent) => void;

  /**
   * Get context menu items for a row
   */
  readonly getContextMenuItems?: (
    row: TData
  ) => ContextMenuItemType[] | Promise<ContextMenuItemType[]>;

  /**
   * Get custom class names for a row
   */
  readonly getRowClassName?: (row: TData, index: number) => string;

  /**
   * Get a stable test ID for a row when callers need selector-level targeting.
   */
  readonly getRowTestId?: (row: TData, index: number) => string | undefined;

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
   * Optional per-column skeleton config to preserve final layout geometry.
   */
  readonly skeletonColumnConfig?: Array<{
    readonly width?: string;
    readonly variant?:
      | 'text'
      | 'avatar'
      | 'badge'
      | 'button'
      | 'release'
      | 'meta';
  }>;

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
   * Custom global filter function for client-side search.
   * Defaults to TanStack Table's built-in 'includesString'.
   * Use createMultiFieldFilterFn() to search across non-column fields.
   */
  readonly globalFilterFn?: FilterFn<TData>;

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
   * Whether there are more pages to load (infinite scroll)
   */
  readonly hasNextPage?: boolean;

  /**
   * Whether the next page is currently being fetched
   */
  readonly isFetchingNextPage?: boolean;

  /**
   * Callback to load more data when scrolling near the bottom
   */
  readonly onLoadMore?: () => void;

  /**
   * Hide the column header row
   * @default false
   */
  readonly hideHeader?: boolean;

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
  rowHeight = 32,
  overscan = 5,
  renderRow,
  getRowId,
  onRowClick,
  onRowShiftClick,
  onRowContextMenu,
  getContextMenuItems,
  getRowClassName,
  getRowTestId,
  className,
  containerClassName,
  minWidth = `${TABLE_MIN_WIDTHS.MEDIUM}px`,
  skeletonRows = 20,
  skeletonColumnConfig,
  groupingConfig,
  enableKeyboardNavigation,
  focusedRowIndex: controlledFocusedIndex,
  onFocusedRowChange,
  globalFilter,
  onGlobalFilterChange,
  enableFiltering = false,
  globalFilterFn: globalFilterFnProp,
  columnPinning,
  enablePinning = false,
  columnVisibility,
  onColumnVisibilityChange,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  hideHeader = false,
  expandedRowIds,
  renderExpandedContent,
  getExpandableRowId,
}: UnifiedTableProps<TData>) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const setTableContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (tableContainerRef.current === node) return;
      tableContainerRef.current = node;
      setScrollRoot(node);
    },
    [setScrollRoot]
  );

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
    globalFilterFn: globalFilterFnProp ?? 'includesString',
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
      scrollRoot,
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

  // Row lookup map for grouped table mode — rebuilt when rows change
  const groupedRowMap = useMemo(
    () =>
      new Map(
        table
          .getRowModel()
          .rows.map(r => [getRowId ? getRowId(r.original) : r.original, r])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rows` triggers table model rebuild
    [rows, getRowId, table]
  );

  // Memoized row renderer for grouped table mode
  const renderGroupedRow = useCallback(
    (item: TData, index: number) => {
      const row = groupedRowMap.get(getRowId ? getRowId(item) : item);
      if (!row) return null;

      const rowData = row.original as TData;

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
          getRowTestId={getRowTestId}
          onRowShiftClick={onRowShiftClick}
        />
      );

      const rowId =
        getExpandableRowId?.(rowData) ?? getRowId?.(rowData) ?? row.id;
      const isExpanded = expandedRowIds?.has(rowId);
      const expandedContent =
        isExpanded && renderExpandedContent
          ? renderExpandedContent(rowData, columns.length)
          : null;

      const wrappedRowElement = getContextMenuItems ? (
        <TableContextMenu
          key={row.id}
          getItems={() => getContextMenuItems(rowData)}
        >
          {rowElement}
        </TableContextMenu>
      ) : (
        rowElement
      );

      if (expandedContent) {
        return (
          <React.Fragment key={row.id}>
            {wrappedRowElement}
            <tr>
              <td colSpan={columns.length} className='p-0'>
                {expandedContent}
              </td>
            </tr>
          </React.Fragment>
        );
      }

      return wrappedRowElement;
    },
    [
      groupedRowMap,
      getRowId,
      shouldEnableKeyboardNav,
      focusedIndex,
      onRowClick,
      onRowContextMenu,
      handleKeyDown,
      setFocusedIndex,
      getRowClassName,
      getRowTestId,
      onRowShiftClick,
      getExpandableRowId,
      expandedRowIds,
      renderExpandedContent,
      columns.length,
      getContextMenuItems,
    ]
  );

  // Infinite scroll sentinel — fires onLoadMore when visible
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollContainer = tableContainerRef.current;
    if (!sentinel || !scrollContainer || !onLoadMore || !hasNextPage) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { root: scrollContainer, rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasNextPage, isFetchingNextPage]);

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
        ref={setTableContainerRef}
        className={cn('overflow-auto', containerClassName)}
      >
        <table className={tableClassName} style={{ minWidth }}>
          <caption className='sr-only'>Loading table data</caption>
          {!hideHeader && (
            <UnifiedTableHeader headerGroups={table.getHeaderGroups()} />
          )}
          <LoadingTableBody
            rows={skeletonRows}
            columns={columnCount}
            columnConfig={skeletonColumnConfig}
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
        ref={setTableContainerRef}
        className={cn('overflow-auto', containerClassName)}
      >
        <table className={tableClassName} style={{ minWidth }}>
          <caption className='sr-only'>Empty table</caption>
          {!hideHeader && (
            <UnifiedTableHeader headerGroups={table.getHeaderGroups()} />
          )}
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
      <div
        ref={setTableContainerRef}
        className={cn('overflow-auto', containerClassName)}
      >
        <table className={tableClassName} style={{ minWidth }}>
          <caption className='sr-only'>Grouped table data</caption>
          {!hideHeader && (
            <UnifiedTableHeader headerGroups={table.getHeaderGroups()} />
          )}
          <GroupedTableBody
            groupedData={groupedData}
            observeGroupHeader={observeGroupHeader}
            visibleGroupIndex={visibleGroupIndex}
            columns={columns.length}
            renderRow={renderGroupedRow}
          />
        </table>
      </div>
    );
  }

  // Render table with data
  return (
    <div
      ref={setTableContainerRef}
      className={cn('overflow-auto', containerClassName)}
    >
      <table className={tableClassName} style={{ minWidth }}>
        <caption className='sr-only'>Data table</caption>
        {!hideHeader && (
          <UnifiedTableHeader headerGroups={table.getHeaderGroups()} />
        )}
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
          onRowShiftClick={onRowShiftClick}
          getRowClassName={getRowClassName}
          getRowTestId={getRowTestId}
          renderRow={renderRow}
          getRowId={getRowId}
          expandedRowIds={expandedRowIds}
          renderExpandedContent={renderExpandedContent}
          getExpandableRowId={getExpandableRowId}
          columnCount={columnCount}
        />
        {/* Infinite scroll sentinel + loading indicator */}
        {onLoadMore && (
          <tbody>
            <tr ref={sentinelRef}>
              <td style={{ height: 1, padding: 0, border: 'none' }} />
            </tr>
            {isFetchingNextPage && (
              <tr>
                <td
                  colSpan={columnCount}
                  className='py-1.5 text-center text-[11px] text-tertiary-token'
                >
                  <span className='inline-flex items-center gap-1.5'>
                    <LoadingSpinner
                      size='sm'
                      tone='muted'
                      label='Loading more'
                    />
                    {' Loading more...'}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}
