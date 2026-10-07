'use client';

import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

export interface PresenceWorkspaceScope {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly target: 'creator' | 'company';
}

/** Also scopes target adapters' query keys; never persist across actors. */
export function presenceWorkspaceScopeKey(
  scope: PresenceWorkspaceScope
): string {
  return JSON.stringify([scope.actorId, scope.workspaceId, scope.target]);
}

/** Remount all workspace-owned state, including target-specific draft state. */
export function PresenceWorkspaceBoundary({
  scope,
  children,
}: Readonly<{
  scope: PresenceWorkspaceScope;
  children: ReactNode;
}>) {
  return <Fragment key={presenceWorkspaceScopeKey(scope)}>{children}</Fragment>;
}

export interface PresenceWorkspaceAdapter<Row, Filter extends string> {
  readonly filterRows: (rows: readonly Row[], filter: Filter) => readonly Row[];
  readonly sortRows: (rows: readonly Row[]) => Row[];
  readonly canSelect?: (row: Row) => boolean;
}

/** One filter, selection and row-projection lifecycle for both target adapters. */
export function usePresenceWorkspaceController<
  Row extends { readonly id: string },
  Filter extends string,
>({
  sourceRows,
  initialFilter,
  adapter,
}: Readonly<{
  sourceRows: readonly Row[];
  initialFilter: NoInfer<Filter>;
  adapter: PresenceWorkspaceAdapter<Row, Filter>;
}>) {
  const [filter, updateFilter] = useState(initialFilter);
  const [selectedId, updateSelectedId] = useState<string | null>(null);
  const rows = useMemo(
    () => adapter.sortRows(adapter.filterRows(sourceRows, filter)),
    [adapter, sourceRows, filter]
  );
  // Resolve against current authorized data, never a stale object snapshot.
  const selected = sourceRows.find(row => row.id === selectedId) ?? null;
  useEffect(() => {
    if (selectedId !== null && selected === null) updateSelectedId(null);
  }, [selected, selectedId]);
  const setFilter = useCallback((next: Filter) => {
    updateFilter(next);
    updateSelectedId(null);
  }, []);
  const setSelected = useCallback(
    (row: Row | null) => {
      updateSelectedId(
        row && adapter.canSelect?.(row) !== false ? row.id : null
      );
    },
    [adapter]
  );
  return { filter, setFilter, rows, selected, setSelected };
}
