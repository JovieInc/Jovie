'use client';

import { useMemo } from 'react';
import type { ColumnDef, RowData, VisibilityState } from '@/lib/tanstack-table';
import { readColumnId } from '../column-priority';

type AccessorColumn = {
  id?: string;
  accessorKey?: unknown;
  accessorFn?: (row: never, index: number) => unknown;
};

function isPresent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Ids of columns flagged `meta.hideWhenEmpty` that no loaded row has a value
 * for. Empty tables keep their columns so the empty state still reads as a
 * table. Implemented once here so every UnifiedTable inherits it.
 */
export function findEmptyHideableColumnIds<TData extends RowData>(
  columns: ReadonlyArray<ColumnDef<TData, unknown>>,
  data: readonly TData[]
): string[] {
  if (data.length === 0) return [];
  const ids: string[] = [];
  for (const column of columns) {
    if (column.meta?.hideWhenEmpty !== true) continue;
    const id = readColumnId(column as AccessorColumn);
    if (!id) continue;
    const def = column as AccessorColumn;
    const hasValue =
      column.meta.hasValue ??
      ((row: TData) => {
        if (def.accessorFn) return isPresent(def.accessorFn(row as never, 0));
        if (typeof def.accessorKey === 'string') {
          return isPresent((row as Record<string, unknown>)[def.accessorKey]);
        }
        return true;
      });
    if (!data.some(row => hasValue(row))) ids.push(id);
  }
  return ids;
}

/** Merges priority layout, caller visibility, and empty-column hiding. */
export function useEffectiveColumnVisibility<TData extends RowData>({
  columns,
  data,
  columnVisibility,
  autoLayout,
  hasColumnPriority,
}: Readonly<{
  columns: ReadonlyArray<ColumnDef<TData, unknown>>;
  data: readonly TData[];
  columnVisibility: VisibilityState | undefined;
  autoLayout: {
    readonly hiddenIds: readonly string[];
    readonly visibility: VisibilityState;
  };
  hasColumnPriority: boolean;
}>): VisibilityState | undefined {
  const emptyColumnIds = useMemo(
    () => findEmptyHideableColumnIds(columns, data),
    [columns, data]
  );
  return useMemo(() => {
    const withEmpty = (base: VisibilityState | undefined) => {
      if (emptyColumnIds.length === 0) return base;
      const merged: VisibilityState = { ...(base ?? {}) };
      for (const id of emptyColumnIds) merged[id] = false;
      return merged;
    };
    if (!hasColumnPriority) return withEmpty(columnVisibility);
    if (columnVisibility == null && autoLayout.hiddenIds.length === 0) {
      return withEmpty(autoLayout.visibility);
    }
    const merged: VisibilityState = { ...(columnVisibility ?? {}) };
    for (const id of autoLayout.hiddenIds) merged[id] = false;
    return withEmpty(merged);
  }, [
    autoLayout.hiddenIds,
    autoLayout.visibility,
    columnVisibility,
    emptyColumnIds,
    hasColumnPriority,
  ]);
}
