'use client';

/**
 * v8→v9 TanStack Table compatibility shim (PR #16994 remediation).
 *
 * `@tanstack/react-table` v9 made row models tree-shakeable features, moved
 * the hook to `useTable` with an explicit `features` option, and tightened
 * `RowData` from `any` to `Record<string, any> | Array<any>`. Rather than
 * rewrite ~60 consumer files inside a dependabot PR, route every v8-style
 * import through TanStack's official compat entry
 * (`@tanstack/react-table/legacy`: `useLegacyTable`,
 * `legacyCreateColumnHelper`, the v8 row-model stubs).
 *
 * Type parameters are bridged with a `TData & RowData` intersection so the
 * repo's unconstrained generics (including `interface` row types, which do
 * not satisfy v9's `RowData` constraint) keep compiling. Everything here is
 * deprecated upstream — the native-v9 migration will retire this module.
 */

import type {
  CellContext as CoreCellContext,
  ColumnDef as CoreColumnDef,
  FilterFn as CoreFilterFn,
  Header as CoreHeader,
  HeaderContext as CoreHeaderContext,
  HeaderGroup as CoreHeaderGroup,
  Row as CoreRow,
  Table as CoreTable,
  RowData,
  TableFeatures,
} from '@tanstack/react-table';
import type { ColumnHelper as CoreColumnHelper } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import type {
  LegacyFeatures,
  LegacyTableOptions,
} from '@tanstack/react-table/legacy';
import {
  legacyCreateColumnHelper,
  getCoreRowModel as legacyGetCoreRowModel,
  getFilteredRowModel as legacyGetFilteredRowModel,
  getSortedRowModel as legacyGetSortedRowModel,
  useLegacyTable,
} from '@tanstack/react-table/legacy';

export { flexRender };

// ---------------------------------------------------------------------------
// Runtime API (v8 names → v9 legacy implementation)
// ---------------------------------------------------------------------------

/** Internal: bridge an unconstrained TData into v9's RowData constraint. */
type Bridged<TData> = TData & RowData;

/** v8-shaped row-model factory (unconstrained TData). */
export type RowModelFactory<TData> = (
  table: Table<TData>
) => () => import('@tanstack/react-table').RowModel<
  LegacyFeatures,
  Bridged<TData>
>;

/** @deprecated v8-style helper; v9 native is `createColumnHelper<TFeatures, TData>`. */
export function createColumnHelper<TData>(): ColumnHelper<TData> {
  return legacyCreateColumnHelper<
    Bridged<TData>
  >() as unknown as ColumnHelper<TData>;
}

/** @deprecated v8-style hook; v9 native is `useTable` with `features`. */
export function useReactTable<TData>(
  options: V8TableOptions<TData>
): Table<TData> {
  return useLegacyTable(options as never) as unknown as Table<TData>;
}

/**
 * v8-shaped table options. `state` is intentionally loosened to match the
 * v8 call sites (the repo builds partial state objects dynamically).
 */
export type V8TableOptions<TData> = Omit<
  LegacyTableOptions<Bridged<TData>>,
  | 'data'
  | 'columns'
  | 'state'
  | 'getCoreRowModel'
  | 'getSortedRowModel'
  | 'getFilteredRowModel'
> & {
  data: TData[];
  columns?: ColumnDef<TData, unknown>[];
  state?: Record<string, unknown>;
  getCoreRowModel?: RowModelFactory<TData>;
  getSortedRowModel?: RowModelFactory<TData>;
  getFilteredRowModel?: RowModelFactory<TData>;
};

/** v8-style no-op stub (core row model is always built in v9). */
export function getCoreRowModel<TData>(): RowModelFactory<TData> {
  return legacyGetCoreRowModel<
    Bridged<TData>
  >() as unknown as RowModelFactory<TData>;
}

/** v8-style marker stub enabling the sorted row model. */
export function getSortedRowModel<TData>(): RowModelFactory<TData> {
  return legacyGetSortedRowModel<
    Bridged<TData>
  >() as unknown as RowModelFactory<TData>;
}

/** v8-style marker stub enabling the filtered row model. */
export function getFilteredRowModel<TData>(): RowModelFactory<TData> {
  return legacyGetFilteredRowModel<
    Bridged<TData>
  >() as unknown as RowModelFactory<TData>;
}

// ---------------------------------------------------------------------------
// Types (single-generic v8-style aliases over the legacy feature set)
// ---------------------------------------------------------------------------

export type { RowData };

export type ColumnDef<TData, TValue = unknown> = CoreColumnDef<
  LegacyFeatures,
  Bridged<TData>,
  TValue
>;

export type CellContext<TData, TValue = unknown> = CoreCellContext<
  LegacyFeatures,
  Bridged<TData>,
  TValue
>;

export type HeaderContext<TData, TValue = unknown> = CoreHeaderContext<
  LegacyFeatures,
  Bridged<TData>,
  TValue
>;

export type Header<TData, TValue = unknown> = CoreHeader<
  LegacyFeatures,
  Bridged<TData>,
  TValue
>;

export type HeaderGroup<TData> = CoreHeaderGroup<
  LegacyFeatures,
  Bridged<TData>
>;

export type Row<TData> = CoreRow<LegacyFeatures, Bridged<TData>>;

export type Table<TData> = CoreTable<LegacyFeatures, Bridged<TData>>;

export type Column<
  TData,
  TValue = unknown,
> = import('@tanstack/react-table').Column<
  LegacyFeatures,
  Bridged<TData>,
  TValue
>;

export type FilterFn<TData> = CoreFilterFn<LegacyFeatures, Bridged<TData>>;

/**
 * v8-shaped single-generic ColumnHelper over v9's natively-inferring legacy
 * helper. v9's `accessor` infers `TValue` from the accessor key/function
 * (`DeepValue`), restoring v8's `info.getValue()` value typing that the
 * previous hand-rolled helper type erased (cell renderers received `unknown`).
 */
export type ColumnHelper<TData> = Omit<
  CoreColumnHelper<LegacyFeatures, Bridged<TData>>,
  'display'
> & {
  /** Overridden so `display` returns the repo's v8-shaped ColumnDef. */
  display: (
    column: ColumnDef<TData, unknown> & { id: string }
  ) => ColumnDef<TData, unknown>;
};

// ---------------------------------------------------------------------------
// State shapes: identical between v8 and v9. `VisibilityState` was renamed
// `ColumnVisibilityState` in v9 — re-export under the v8 name.
// ---------------------------------------------------------------------------

export type {
  ColumnPinningState,
  OnChangeFn,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table';

export type VisibilityState =
  import('@tanstack/react-table').ColumnVisibilityState;

// Module augmentation consumer anchor (table.types.ts merges into v9 core).
export type { TableFeatures };
