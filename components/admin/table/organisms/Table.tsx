'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo, useEffect } from 'react';
import { AdminTableShell } from '../AdminTableShell';
import { useRowSelection } from '../useRowSelection';
import { TableCell, TableHeaderCell, TableCheckboxCell } from '../atoms';
import {
  TableRow,
  TableHeaderRow,
  TableBulkActionsToolbar,
  TablePaginationFooter,
  TableSearchBar,
  type BulkAction,
} from '../molecules';

export interface Column<T> {
  id: string;
  header: string | React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  width?: string;
  sortable?: boolean;
  hideOnMobile?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface PaginationConfig {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export interface TableProps<T> {
  // Data
  data: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;

  // Selection
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;

  // Sorting
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  onSortChange?: (column: string, direction: 'asc' | 'desc' | null) => void;

  // Pagination
  pagination?: PaginationConfig;

  // Bulk Actions
  bulkActions?: BulkAction[];

  // Search
  searchable?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  // Virtualization
  virtualizationThreshold?: number;
  rowHeight?: number;
  overscan?: number;

  // Layout
  className?: string;
  caption?: string;
}

export function Table<T>({
  data,
  columns,
  getRowId,
  selectable = false,
  selectedIds: externalSelectedIds,
  onSelectionChange: externalOnSelectionChange,
  sortColumn,
  sortDirection,
  onSortChange,
  pagination,
  bulkActions = [],
  searchable = false,
  searchValue = '',
  onSearchChange,
  searchPlaceholder,
  virtualizationThreshold = 50,
  rowHeight = 60,
  overscan = 5,
  className,
  caption,
}: TableProps<T>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Row selection logic
  const rowIds = useMemo(() => data.map(getRowId), [data, getRowId]);
  const {
    selectedIds: internalSelectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  } = useRowSelection(rowIds);

  const selectedIds = externalSelectedIds ?? internalSelectedIds;

  // Sync external selection changes
  useEffect(() => {
    if (externalOnSelectionChange && selectedIds !== externalSelectedIds) {
      externalOnSelectionChange(internalSelectedIds);
    }
  }, [
    internalSelectedIds,
    externalOnSelectionChange,
    selectedIds,
    externalSelectedIds,
  ]);

  // Determine if virtualization should be enabled
  const useVirtualization = data.length > virtualizationThreshold;

  // Virtualization setup
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan,
    enabled: useVirtualization,
  });

  const virtualRows = useVirtualization ? virtualizer.getVirtualItems() : null;
  const totalHeight = useVirtualization
    ? virtualizer.getTotalSize()
    : undefined;

  // Handle sort
  const handleSort = (columnId: string) => {
    if (!onSortChange) return;

    let newDirection: 'asc' | 'desc' | null = 'asc';

    if (sortColumn === columnId) {
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newDirection = null;
      }
    }

    onSortChange(columnId, newDirection);
  };

  // Has toolbar or footer
  const hasToolbar = searchable || selectedCount > 0;
  const hasFooter = !!pagination;

  // Prepare bulk actions with selected IDs
  const preparedBulkActions = useMemo(
    () =>
      bulkActions.map(action => ({
        ...action,
        onClick: () => action.onClick(),
      })),
    [bulkActions]
  );

  // Prepare toolbar content
  const toolbarContent = hasToolbar ? (
    selectedCount > 0 ? (
      <TableBulkActionsToolbar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        actions={preparedBulkActions}
      />
    ) : searchable ? (
      <div className='px-4 py-3'>
        <TableSearchBar
          value={searchValue}
          onChange={onSearchChange ?? (() => {})}
          placeholder={searchPlaceholder}
        />
      </div>
    ) : null
  ) : undefined;

  return (
    <AdminTableShell
      toolbar={toolbarContent}
      footer={
        hasFooter && pagination ? (
          <TablePaginationFooter
            currentPage={pagination.currentPage}
            totalPages={Math.ceil(pagination.totalItems / pagination.pageSize)}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        ) : undefined
      }
      scrollContainerRef={scrollContainerRef}
      className={className}
    >
      {({ stickyTopPx }) => (
        <table className='w-full min-w-[960px] table-fixed border-separate border-spacing-0 text-[13px]'>
          {caption && <caption className='sr-only'>{caption}</caption>}

          <thead>
            <TableHeaderRow stickyOffset={stickyTopPx}>
              {/* Checkbox column */}
              {selectable && (
                <TableCheckboxCell
                  isHeader
                  checked={headerCheckboxState === true}
                  indeterminate={headerCheckboxState === 'indeterminate'}
                  onChange={toggleSelectAll}
                  ariaLabel='Select all rows'
                  className='w-14'
                />
              )}

              {/* Data columns */}
              {columns.map(column => (
                <TableHeaderCell
                  key={column.id}
                  width={column.width}
                  align={column.align}
                  hideOnMobile={column.hideOnMobile}
                  sortable={column.sortable}
                  sortDirection={
                    sortColumn === column.id ? sortDirection : null
                  }
                  onSort={
                    column.sortable ? () => handleSort(column.id) : undefined
                  }
                  stickyTop={stickyTopPx}
                >
                  {column.header}
                </TableHeaderCell>
              ))}
            </TableHeaderRow>
          </thead>

          <tbody
            style={
              useVirtualization
                ? {
                    height: `${totalHeight}px`,
                    position: 'relative',
                  }
                : undefined
            }
          >
            {useVirtualization && virtualRows
              ? // Virtualized rendering
                virtualRows.map(virtualRow => {
                  const row = data[virtualRow.index];
                  const rowId = getRowId(row);
                  const isSelected = selectedIds.has(rowId);

                  return (
                    <TableRow
                      key={rowId}
                      selected={isSelected}
                      virtualRow={{ start: virtualRow.start }}
                    >
                      {selectable && (
                        <TableCheckboxCell
                          checked={isSelected}
                          onChange={() => toggleSelect(rowId)}
                          rowNumber={virtualRow.index + 1}
                          ariaLabel={`Select row ${virtualRow.index + 1}`}
                        />
                      )}

                      {columns.map(column => (
                        <TableCell
                          key={column.id}
                          width={column.width}
                          align={column.align}
                          hideOnMobile={column.hideOnMobile}
                        >
                          {column.cell(row, virtualRow.index)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              : // Standard rendering
                data.map((row, index) => {
                  const rowId = getRowId(row);
                  const isSelected = selectedIds.has(rowId);

                  return (
                    <TableRow key={rowId} selected={isSelected}>
                      {selectable && (
                        <TableCheckboxCell
                          checked={isSelected}
                          onChange={() => toggleSelect(rowId)}
                          rowNumber={index + 1}
                          ariaLabel={`Select row ${index + 1}`}
                        />
                      )}

                      {columns.map(column => (
                        <TableCell
                          key={column.id}
                          width={column.width}
                          align={column.align}
                          hideOnMobile={column.hideOnMobile}
                        >
                          {column.cell(row, index)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
          </tbody>
        </table>
      )}
    </AdminTableShell>
  );
}
