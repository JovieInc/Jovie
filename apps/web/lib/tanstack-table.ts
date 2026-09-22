/**
 * TanStack Table v8 API surface backed by v9's official legacy compatibility
 * layer (`@tanstack/react-table/legacy`).
 *
 * All table code must import from this module instead of
 * `@tanstack/react-table` directly so the v9 migration stays a one-file change.
 */
import type {
  CellContext as CoreCellContext,
  FilterFn as CoreFilterFn,
  HeaderContext as CoreHeaderContext,
  RowData,
} from '@tanstack/react-table';
import type { LegacyFeatures } from '@tanstack/react-table/legacy';

export type {
  ColumnFiltersState,
  ColumnPinningState,
  ColumnSort,
  ColumnVisibilityState as VisibilityState,
  OnChangeFn,
  RowData,
  RowSelectionState,
  SortingState,
  Updater,
} from '@tanstack/react-table';
export { flexRender } from '@tanstack/react-table';
export type {
  LegacyCell as Cell,
  LegacyColumn as Column,
  LegacyColumnDef as ColumnDef,
  LegacyFeatures,
  LegacyHeader as Header,
  LegacyHeaderGroup as HeaderGroup,
  LegacyReactTable,
  LegacyRow as Row,
  LegacyTable as Table,
  LegacyTableOptions as TableOptions,
} from '@tanstack/react-table/legacy';
export {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  legacyCreateColumnHelper as createColumnHelper,
  useLegacyTable as useReactTable,
} from '@tanstack/react-table/legacy';

/** v8-shaped generics bound to the legacy feature set. */
export type CellContext<
  TData extends RowData,
  TValue = unknown,
> = CoreCellContext<LegacyFeatures, TData, TValue>;
export type HeaderContext<
  TData extends RowData,
  TValue = unknown,
> = CoreHeaderContext<LegacyFeatures, TData, TValue>;
export type FilterFn<TData extends RowData> = CoreFilterFn<
  LegacyFeatures,
  TData
>;
