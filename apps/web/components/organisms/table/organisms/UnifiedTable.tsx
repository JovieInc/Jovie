'use client';

// @coverage-via apps/web/components/organisms/table/organisms/UnifiedTable.sort-provenance.test.tsx

import { Spinner as LoadingSpinner } from '@jovie/ui';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TABLE_MIN_WIDTHS, TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import {
  type ColumnDef,
  type ColumnPinningState,
  type FilterFn,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@/lib/tanstack-table';
import { TABLE_EMPTY_STATE_MIN_HEIGHT_PX } from '../atoms/TableEmptyState';
import { ColumnSnapMotion } from '../ColumnSnapMotion';
import { columnPrioritySpecsFromDefs, readColumnId } from '../column-priority';
import {
  type ColumnCompactItem,
  ColumnCompactProvider,
} from '../column-priority-context';
import { useColumnPriorityLayout } from '../hooks/useColumnPriorityLayout';
import { GroupedTableBody } from '../molecules/GroupedTableBody';
import { LoadingTableBody } from '../molecules/LoadingTableBody';
import {
  type ContextMenuItemType,
  TableContextMenu,
} from '../molecules/TableContextMenu';
import {
  cn,
  iconColors,
  TABLE_ROW_MODES,
  type TableRowMode,
  tableRowModeStyle,
  zIndex,
} from '../table.styles';
import { useTableGrouping } from '../utils/useTableGrouping';
import { UnifiedTableHeader } from './UnifiedTableHeader';
import { useTableKeyboardNav } from './useTableKeyboardNav';
import { useTableVirtualization } from './useTableVirtualization';
import { VirtualizedTableBody } from './VirtualizedTableBody';
import { VirtualizedTableRow } from './VirtualizedTableRow';

export interface UnifiedTableProps<TData extends RowData> {
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
   * @default 40
   */
  readonly rowHeight?: number;
  /** Fixed geometry for content, loading rows, and virtualization. */
  readonly rowMode?: TableRowMode;

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
  readonly contextMenuSearchable?: boolean;
  readonly contextMenuSearchPlaceholder?: string;
  readonly contextMenuSearchMode?: 'root' | 'recursive';

  /**
   * Get custom class names for a row
   */
  readonly getRowClassName?: (row: TData, index: number) => string;

  /**
   * Returns whether a row is selected when selection is owned by a consumer
   * (for example, a persistent details rail rather than TanStack's checkbox
   * selection state). The shared row then exposes the selection to assistive
   * technology and applies the canonical selected treatment.
   */
  readonly isRowSelected?: (row: TData, index: number) => boolean;

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
   * Layout-snap columns when they appear or disappear.
   * Short, interruptible, and skipped when the user prefers reduced motion.
   * Dense admin tables pass false.
   * @default true
   */
  readonly columnSnap?: boolean;

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
   * Accessible caption for the table, rendered sr-only. Pass a surface-specific
   * label (e.g. "Releases") so screen readers announce more than "Data table".
   */
  readonly caption?: string;

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
 * Humanize a column id (e.g. "releaseDate" -> "Release date") for sort
 * provenance when no string header label is available.
 */
function humanizeColumnId(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (words.length === 0) return id;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * HiddenHeaderSortStatus - Visible + announced sort provenance for tables whose
 * column header is hidden (eval G4 / GAP-01). Rendered as a sticky status bar
 * pinned above the scrollable rows so sorted order is never invisible.
 */
function HiddenHeaderSortStatus({
  label,
  descending,
}: {
  readonly label: string;
  readonly descending: boolean;
}) {
  return (
    <div
      role='status'
      className={cn(
        'sticky top-0',
        zIndex.toolbar,
        'flex items-center gap-1.5 border-b border-subtle bg-(--app-shell-content-surface) px-3 py-1 text-2xs text-tertiary-token'
      )}
    >
      <Icon
        name={descending ? 'ArrowDown' : 'ArrowUp'}
        aria-hidden
        size={12}
        className={cn('shrink-0', iconColors.sortIndicator)}
      />
      <span>{`Sorted by ${label}, ${descending ? 'descending' : 'ascending'}`}</span>
    </div>
  );
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
function UnifiedTableContent<TData extends RowData>({
  data,
  columns,
  isLoading = false,
  emptyState,
  rowSelection,
  onRowSelectionChange,
  sorting,
  onSortingChange,
  enableVirtualization,
  rowHeight = TABLE_ROW_HEIGHTS.STANDARD,
  rowMode,
  overscan = 5,
  renderRow,
  getRowId,
  onRowClick,
  onRowShiftClick,
  onRowContextMenu,
  getContextMenuItems,
  contextMenuSearchable = false,
  contextMenuSearchPlaceholder,
  contextMenuSearchMode = 'root',
  getRowClassName,
  isRowSelected,
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
  columnSnap = true,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  hideHeader = false,
  caption,
  expandedRowIds,
  renderExpandedContent,
  getExpandableRowId,
}: UnifiedTableProps<TData>) {
  // Cell identity follows the table option. The provider disables layout
  // animation for reduced motion without remounting cells after hydration.
  const snapColumns = columnSnap;
  const resolvedRowHeight = rowMode
    ? TABLE_ROW_MODES[rowMode].rowHeight
    : rowHeight;
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [rowRefs] = useState(() => new Map<number, HTMLTableRowElement>());
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const setTableContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (tableContainerRef.current === node) return;
      tableContainerRef.current = node;
      setScrollRoot(node);
    },
    [setScrollRoot]
  );

  // Columns that declare a priority lay themselves out from this container.
  // A caller can hide more columns. Priority only hides; it does not force a
  // column back on. Audience still passes its shell measurement so the
  // historical floors stay put before this container is measured.
  const prioritySpecs = useMemo(
    () => columnPrioritySpecsFromDefs(columns),
    [columns]
  );
  const hasColumnPriority = prioritySpecs.some(
    column => column.priority != null
  );
  const autoLayout = useColumnPriorityLayout(
    prioritySpecs,
    hasColumnPriority ? scrollRoot : null
  );
  const effectiveColumnVisibility = useMemo(() => {
    if (!hasColumnPriority) return columnVisibility;
    if (columnVisibility == null && autoLayout.hiddenIds.length === 0) {
      return autoLayout.visibility;
    }
    const merged: VisibilityState = { ...(columnVisibility ?? {}) };
    for (const id of autoLayout.hiddenIds) merged[id] = false;
    return merged;
  }, [
    autoLayout.hiddenIds,
    autoLayout.visibility,
    columnVisibility,
    hasColumnPriority,
  ]);
  const columnCompacts = useMemo(() => {
    const primaryColumn = columns.find(column => column.meta?.primary === true);
    const primaryId = primaryColumn
      ? readColumnId(primaryColumn as { id?: string; accessorKey?: unknown })
      : null;
    const items: ColumnCompactItem[] = [];
    if (!primaryId) return { primaryId, items };
    for (const column of columns) {
      const id = readColumnId(column as { id?: string; accessorKey?: unknown });
      const compact = column.meta?.compact;
      if (!id || !compact || effectiveColumnVisibility?.[id] !== false) {
        continue;
      }
      items.push({
        id,
        render: compact as ColumnCompactItem['render'],
      });
    }
    return { primaryId, items };
  }, [columns, effectiveColumnVisibility]);

  // Internal focused row state (uncontrolled mode)
  // Roving tabindex needs a deterministic first stop. Focus-visible styling
  // remains CSS-driven, so this does not paint a focus ring before keyboard
  // focus actually reaches the table.
  const [internalFocusedIndex, setInternalFocusedIndex] = useState<number>(0);

  // Use controlled or uncontrolled focus
  const requestedFocusedIndex = controlledFocusedIndex ?? internalFocusedIndex;
  const setFocusedIndex = useCallback(
    (index: number) => {
      setInternalFocusedIndex(index);
      onFocusedRowChange?.(index);
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
  const coreRowModel = getCoreRowModel<TData>();
  const sortedRowModel = getSortedRowModel<TData>();
  const filteredRowModel = useMemo(
    () => (enableFiltering ? getFilteredRowModel<TData>() : undefined),
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
    if (effectiveColumnVisibility !== undefined) {
      state.columnVisibility = effectiveColumnVisibility;
    }
    return state;
  }, [
    rowSelection,
    sorting,
    globalFilter,
    columnPinning,
    effectiveColumnVisibility,
  ]);

  const table = useReactTable({
    data,
    columns,
    state: tableState,
    onRowSelectionChange,
    ...(onSortingChange ? { onSortingChange } : {}),
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
  const resolvedColumnVisibility = table.getState().columnVisibility;

  const focusedIndex = Math.max(
    0,
    Math.min(requestedFocusedIndex, rows.length - 1)
  );

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
    paddingTop,
    paddingBottom,
  } = useTableVirtualization({
    rowCount: rows.length,
    scrollElementRef: tableContainerRef,
    estimatedRowHeight: resolvedRowHeight,
    overscan,
    enabled: shouldVirtualize,
  });

  // Initialize keyboard navigation
  const { handleKeyDown } = useTableKeyboardNav({
    enabled: shouldEnableKeyboardNav,
    focusedIndex,
    rowCount: rows.length,
    rowRefsMap: rowRefs,
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
          visibleCells={row.getVisibleCells()}
          rowIndex={index}
          rowRefsMap={rowRefs}
          shouldEnableKeyboardNav={shouldEnableKeyboardNav}
          shouldVirtualize={false}
          focusedIndex={focusedIndex}
          isSelected={isRowSelected?.(rowData, index)}
          onRowClick={onRowClick}
          onRowContextMenu={onRowContextMenu}
          onKeyDown={handleKeyDown}
          onFocusChange={setFocusedIndex}
          getRowClassName={getRowClassName}
          getRowTestId={getRowTestId}
          onRowShiftClick={onRowShiftClick}
          columnSnap={snapColumns}
          columnSnapOrder={index}
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
          searchable={contextMenuSearchable}
          searchPlaceholder={contextMenuSearchPlaceholder}
          searchMode={contextMenuSearchMode}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibility invalidates stable TanStack rows so compiled grouped bodies recompute cells
    [
      groupedRowMap,
      // TanStack keeps row identity stable when visibility changes. Invalidate
      // the callback so compiled GroupedTableBody renders fresh visible cells.
      resolvedColumnVisibility,
      getRowId,
      shouldEnableKeyboardNav,
      focusedIndex,
      onRowClick,
      onRowContextMenu,
      handleKeyDown,
      setFocusedIndex,
      getRowClassName,
      isRowSelected,
      getRowTestId,
      onRowShiftClick,
      getExpandableRowId,
      expandedRowIds,
      renderExpandedContent,
      columns.length,
      getContextMenuItems,
      contextMenuSearchable,
      contextMenuSearchPlaceholder,
      contextMenuSearchMode,
      rowRefs,
      snapColumns,
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

  // Sort provenance for hidden-header tables: with no <thead> there is no
  // visible indication that rows are sorted, so render a sticky status bar.
  const activeSort = table.getState().sorting?.[0];
  const sortStatusNode = useMemo(() => {
    if (!hideHeader || !activeSort) return null;
    const sortedColumn = table.getColumn(activeSort.id);
    const columnHeader = sortedColumn?.columnDef.header;
    const label =
      typeof columnHeader === 'string' && columnHeader.trim().length > 0
        ? columnHeader
        : humanizeColumnId(activeSort.id);
    return (
      <HiddenHeaderSortStatus label={label} descending={activeSort.desc} />
    );
  }, [hideHeader, activeSort, table]);

  // Common table styles
  const tableClassName = cn(
    'w-full border-separate border-spacing-0 text-app',
    className
  );

  // Loading state
  if (isLoading) {
    // Reserve at least the empty state's stable min-height so loading → empty
    // → populated transitions do not shift layout (JOV-4869).
    const loadingRowCount = Math.max(
      skeletonRows,
      Math.ceil(TABLE_EMPTY_STATE_MIN_HEIGHT_PX / resolvedRowHeight)
    );
    return (
      <div
        ref={setTableContainerRef}
        className={cn('w-full min-w-0 overflow-auto', containerClassName)}
      >
        {sortStatusNode}
        <table
          className={tableClassName}
          data-table-row-mode={rowMode}
          style={{ minWidth, ...tableRowModeStyle(rowMode) }}
        >
          <caption className='sr-only'>
            {caption ?? 'Loading table data'}
          </caption>
          {!hideHeader && (
            <UnifiedTableHeader
              headerGroups={table.getHeaderGroups()}
              columnSnap={snapColumns}
            />
          )}
          <LoadingTableBody
            rows={loadingRowCount}
            columns={columnCount}
            columnConfig={skeletonColumnConfig}
            rowHeight={`${resolvedRowHeight}px`}
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
        className={cn('w-full min-w-0 overflow-auto', containerClassName)}
      >
        {sortStatusNode}
        <table
          className={tableClassName}
          data-table-row-mode={rowMode}
          style={{ minWidth, ...tableRowModeStyle(rowMode) }}
        >
          <caption className='sr-only'>{caption ?? 'Empty table'}</caption>
          {!hideHeader && (
            <UnifiedTableHeader
              headerGroups={table.getHeaderGroups()}
              columnSnap={snapColumns}
            />
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
      <ColumnCompactProvider value={columnCompacts}>
        <div
          ref={setTableContainerRef}
          className={cn('w-full min-w-0 overflow-auto', containerClassName)}
        >
          {sortStatusNode}
          <table
            className={tableClassName}
            data-table-row-mode={rowMode}
            style={{ minWidth, ...tableRowModeStyle(rowMode) }}
          >
            <caption className='sr-only'>
              {caption ?? 'Grouped table data'}
            </caption>
            {!hideHeader && (
              <UnifiedTableHeader
                headerGroups={table.getHeaderGroups()}
                columnSnap={snapColumns}
              />
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
      </ColumnCompactProvider>
    );
  }

  // Render table with data
  return (
    <ColumnCompactProvider value={columnCompacts}>
      <div
        ref={setTableContainerRef}
        className={cn('w-full min-w-0 overflow-auto', containerClassName)}
      >
        {sortStatusNode}
        <table
          className={tableClassName}
          data-table-row-mode={rowMode}
          style={{ minWidth, ...tableRowModeStyle(rowMode) }}
        >
          <caption className='sr-only'>{caption ?? 'Data table'}</caption>
          {!hideHeader && (
            <UnifiedTableHeader
              headerGroups={table.getHeaderGroups()}
              columnSnap={snapColumns}
            />
          )}
          <VirtualizedTableBody
            rows={rows}
            columnVisibility={resolvedColumnVisibility}
            shouldVirtualize={shouldVirtualize}
            virtualRows={virtualRows}
            paddingTop={paddingTop}
            paddingBottom={paddingBottom}
            rowVirtualizer={rowVirtualizer}
            rowRefsMap={rowRefs}
            shouldEnableKeyboardNav={shouldEnableKeyboardNav}
            focusedIndex={focusedIndex}
            onFocusChange={setFocusedIndex}
            onRowClick={onRowClick}
            onRowContextMenu={onRowContextMenu}
            onKeyDown={handleKeyDown}
            getContextMenuItems={getContextMenuItems}
            contextMenuSearchable={contextMenuSearchable}
            contextMenuSearchPlaceholder={contextMenuSearchPlaceholder}
            contextMenuSearchMode={contextMenuSearchMode}
            onRowShiftClick={onRowShiftClick}
            getRowClassName={getRowClassName}
            isRowSelected={isRowSelected}
            getRowTestId={getRowTestId}
            renderRow={renderRow}
            getRowId={getRowId}
            expandedRowIds={expandedRowIds}
            renderExpandedContent={renderExpandedContent}
            getExpandableRowId={getExpandableRowId}
            columnCount={columnCount}
            columnSnap={snapColumns}
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
                    className='py-1.5 text-center text-2xs text-tertiary-token'
                  >
                    <span className='inline-flex items-center gap-1.5'>
                      <LoadingSpinner
                        size='sm'
                        tone='muted'
                        label='Loading More'
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
    </ColumnCompactProvider>
  );
}

export function UnifiedTable<TData extends RowData>(
  props: UnifiedTableProps<TData>
) {
  return (
    <ColumnSnapMotion enabled={props.columnSnap ?? true}>
      <UnifiedTableContent {...props} />
    </ColumnSnapMotion>
  );
}
