'use client';

/**
 * useTableState Hook
 *
 * Builds a conditional state object for TanStack Table.
 * Avoids passing undefined values that could cause errors.
 *
 * @example
 * const tableState = useTableState({
 *   rowSelection,
 *   sorting,
 *   globalFilter,
 *   columnPinning,
 * });
 *
 * const table = useReactTable({
 *   state: tableState,
 *   // ... other options
 * });
 */

import type {
  ColumnPinningState,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table';
import { useMemo } from 'react';

export interface UseTableStateOptions {
  /** Row selection state */
  rowSelection?: RowSelectionState;
  /** Sorting state */
  sorting?: SortingState;
  /** Global filter value */
  globalFilter?: string;
  /** Column pinning state */
  columnPinning?: ColumnPinningState;
}

export type TableStateResult = Record<string, unknown>;

/**
 * Builds a conditional state object for TanStack Table.
 *
 * Only includes properties that are defined, avoiding undefined values
 * that could cause TanStack Table to throw errors or behave unexpectedly.
 */
export function useTableState({
  rowSelection,
  sorting,
  globalFilter,
  columnPinning,
}: UseTableStateOptions): TableStateResult {
  return useMemo(() => {
    const state: Record<string, unknown> = {};
    if (rowSelection !== undefined) state.rowSelection = rowSelection;
    if (sorting !== undefined) state.sorting = sorting;
    if (globalFilter !== undefined) state.globalFilter = globalFilter;
    if (columnPinning !== undefined) state.columnPinning = columnPinning;
    return state;
  }, [rowSelection, sorting, globalFilter, columnPinning]);
}
