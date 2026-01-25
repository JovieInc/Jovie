/**
 * Generic Selection Column Factory
 *
 * Creates type-safe, reusable selection column renderers that work with any table data type.
 * Eliminates duplicate selection column code across tables (ReleaseTable, AdminUsersTable, etc.)
 *
 * Key features:
 * - Uses refs for stable callback access (prevents column recreation on selection change)
 * - Generic type parameter for different row data types
 * - Configurable row ID extraction and row number calculation
 *
 * @example
 * const { createHeaderRenderer, createCellRenderer } = createSelectionColumnFactory({
 *   selectedIdsRef,
 *   headerCheckboxStateRef,
 *   getRowId: (row: ReleaseViewModel) => row.id,
 *   onToggleSelect: toggleSelect,
 *   onToggleSelectAll,
 * });
 *
 * const checkboxColumn = columnHelper.display({
 *   id: 'select',
 *   header: createHeaderRenderer(),
 *   cell: createCellRenderer(),
 *   size: 56,
 * });
 */

import type {
  CellContext,
  HeaderContext,
  Row,
  Table,
} from '@tanstack/react-table';
import type { JSX, RefObject } from 'react';
import { TableCheckboxCell } from '../atoms/TableCheckboxCell';

/**
 * Configuration options for creating selection column renderers.
 */
export interface SelectionColumnOptions<TData> {
  /** Ref to current selected IDs set - read at render time to prevent column recreation */
  selectedIdsRef: RefObject<Set<string>>;
  /** Ref to header checkbox state - read at render time to prevent column recreation */
  headerCheckboxStateRef: RefObject<boolean | 'indeterminate'>;
  /** Extract the unique ID from a row. Required for selection tracking. */
  getRowId: (row: TData) => string;
  /** Callback when a single row's selection is toggled */
  onToggleSelect: (id: string) => void;
  /** Callback when "select all" is toggled */
  onToggleSelectAll: () => void;
  /**
   * Optional: Calculate the display row number (1-indexed).
   * Useful for paginated tables where row.index doesn't match the visual number.
   * @default (rowIndex) => rowIndex + 1
   */
  getRowNumber?: (rowIndex: number, row: Row<TData>) => number;
}

/**
 * Return type for the selection column factory.
 */
export interface SelectionColumnRenderers<TData> {
  /**
   * Creates the header renderer for the checkbox column.
   * Returns a function component that renders the header checkbox.
   */
  createHeaderRenderer: () => (
    props: HeaderContext<TData, unknown>
  ) => JSX.Element;
  /**
   * Creates the cell renderer for the checkbox column.
   * Returns a function component that renders a row checkbox.
   */
  createCellRenderer: () => (props: CellContext<TData, unknown>) => JSX.Element;
}

/**
 * Creates a factory for selection column renderers.
 *
 * This factory generates type-safe header and cell renderers for checkbox selection columns.
 * It uses refs internally to read current selection state at render time, which prevents
 * the column definitions from being recreated when selection changes (avoiding infinite loops).
 *
 * @param options Configuration for the selection column
 * @returns Object with createHeaderRenderer and createCellRenderer functions
 */
export function createSelectionColumnFactory<TData>(
  options: SelectionColumnOptions<TData>
): SelectionColumnRenderers<TData> {
  const {
    selectedIdsRef,
    headerCheckboxStateRef,
    getRowId,
    onToggleSelect,
    onToggleSelectAll,
    getRowNumber = (rowIndex: number) => rowIndex + 1,
  } = options;

  return {
    createHeaderRenderer: () =>
      function SelectHeader({ table }: HeaderContext<TData, unknown>) {
        return (
          <TableCheckboxCell
            table={table as Table<TData>}
            headerCheckboxState={headerCheckboxStateRef.current ?? false}
            onToggleSelectAll={onToggleSelectAll}
          />
        );
      },

    createCellRenderer: () =>
      function SelectCell({ row }: CellContext<TData, unknown>) {
        const data = row.original;
        const id = getRowId(data);
        const isChecked = selectedIdsRef.current?.has(id) ?? false;
        const rowNumber = getRowNumber(row.index, row);

        return (
          <TableCheckboxCell
            row={row}
            rowNumber={rowNumber}
            isChecked={isChecked}
            onToggleSelect={() => onToggleSelect(id)}
          />
        );
      },
  };
}
