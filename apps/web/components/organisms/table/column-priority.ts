import type { ReactNode } from 'react';
import type { ColumnDef, RowData, VisibilityState } from '@/lib/tanstack-table';
import './table.types';

/**
 * Width a column reserves before the priority layout will keep it visible.
 * Equal priorities form one tier and hide together. Omit `priority` to keep
 * the column essential (selection, primary, trailing actions).
 */
export interface ColumnPrioritySpec {
  readonly id: string;
  readonly priority?: number;
  readonly minWidth: number;
}

export interface ColumnPriorityLayout {
  /** Hidden columns only. Visible columns are omitted, matching TanStack's default. */
  readonly visibility: VisibilityState;
  readonly hiddenIds: readonly string[];
  /** Sum of the fit budgets for the columns that remain visible. */
  readonly visibleMinWidth: number;
}

/**
 * Pixels the container must travel past a tier boundary before the set
 * changes. Stops columns flapping when a panel resize oscillates on the cut.
 */
export const COLUMN_PRIORITY_HYSTERESIS_PX = 16;

interface PriorityColumnLike {
  readonly id?: string;
  readonly accessorKey?: unknown;
  readonly minSize?: number;
  readonly size?: number;
  readonly meta?: {
    readonly priority?: number;
    readonly minWidth?: number;
    readonly primary?: boolean;
    readonly compact?: (row: never) => ReactNode;
  };
}

export function readColumnId(column: PriorityColumnLike): string | null {
  if (typeof column.id === 'string' && column.id.length > 0) {
    return column.id;
  }
  if (typeof column.accessorKey === 'string' && column.accessorKey.length > 0) {
    return column.accessorKey;
  }
  return null;
}

/**
 * Fit budget for one column. An explicit `meta.minWidth` wins so a table can
 * keep its rendered size while reserving more room before the column appears.
 */
export function readColumnMinWidth(column: PriorityColumnLike): number {
  const declared = column.meta?.minWidth;
  if (typeof declared === 'number' && declared > 0) return declared;
  if (typeof column.minSize === 'number' && column.minSize > 0) {
    return column.minSize;
  }
  if (
    typeof column.size === 'number' &&
    column.size > 0 &&
    column.size < 9_000
  ) {
    return column.size;
  }
  return 0;
}

export function columnPrioritySpecsFromDefs<TData extends RowData>(
  columns: readonly ColumnDef<TData, unknown>[]
): ColumnPrioritySpec[] {
  return columns.flatMap(column => {
    const like = column as PriorityColumnLike;
    const id = readColumnId(like);
    if (!id) return [];
    const priority = like.meta?.priority;
    return [
      {
        id,
        ...(typeof priority === 'number' ? { priority } : {}),
        minWidth: readColumnMinWidth(like),
      },
    ];
  });
}

function sameHidden(
  left: readonly string[],
  right: readonly string[]
): boolean {
  if (left.length !== right.length) return false;
  const ids = new Set(left);
  return right.every(id => ids.has(id));
}

function sumWidth(columns: readonly ColumnPrioritySpec[]): number {
  return columns.reduce((sum, column) => sum + column.minWidth, 0);
}

/**
 * Show every tier that fits, dropping the lowest priority first. A whole tier
 * drops together. A smaller low-priority tier does not stay behind after a
 * higher tier has been removed.
 */
export function resolveColumnPriorityLayout(
  columns: readonly ColumnPrioritySpec[],
  containerWidth: number
): ColumnPriorityLayout {
  const tiers = new Map<number, ColumnPrioritySpec[]>();
  for (const column of columns) {
    if (column.priority == null) continue;
    const tier = tiers.get(column.priority);
    if (tier) {
      tier.push(column);
    } else {
      tiers.set(column.priority, [column]);
    }
  }

  const dropOrder = [...tiers.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, tier]) => tier);

  const hiddenIds: string[] = [];
  let used = sumWidth(columns);
  for (const tier of dropOrder) {
    if (used <= containerWidth) break;
    for (const column of tier) hiddenIds.push(column.id);
    used -= sumWidth(tier);
  }

  const hidden = new Set(hiddenIds);
  const visibility: VisibilityState = {};
  for (const id of hiddenIds) visibility[id] = false;

  return {
    visibility,
    hiddenIds,
    visibleMinWidth: sumWidth(columns.filter(column => !hidden.has(column.id))),
  };
}

/**
 * Keep the previous column set unless the next set is stable across
 * `containerWidth ± hysteresis`. A one-pixel oscillation on the boundary
 * therefore does not show and hide the same tier.
 */
export function stabilizeColumnPriorityLayout(
  columns: readonly ColumnPrioritySpec[],
  containerWidth: number,
  previous: ColumnPriorityLayout | null,
  hysteresis = COLUMN_PRIORITY_HYSTERESIS_PX
): ColumnPriorityLayout {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return (
      previous ?? resolveColumnPriorityLayout(columns, Number.POSITIVE_INFINITY)
    );
  }

  const next = resolveColumnPriorityLayout(columns, containerWidth);
  if (
    previous &&
    sameHidden(previous.hiddenIds, next.hiddenIds) &&
    previous.visibleMinWidth === next.visibleMinWidth
  ) {
    return previous;
  }

  const knownIds = new Set(columns.map(column => column.id));
  const previousApplies =
    previous != null && previous.hiddenIds.every(id => knownIds.has(id));
  if (!previousApplies || !previous) return next;

  const wider = resolveColumnPriorityLayout(
    columns,
    containerWidth + hysteresis
  );
  const narrower = resolveColumnPriorityLayout(
    columns,
    Math.max(0, containerWidth - hysteresis)
  );
  if (
    !sameHidden(wider.hiddenIds, next.hiddenIds) ||
    !sameHidden(narrower.hiddenIds, next.hiddenIds)
  ) {
    return previous;
  }
  return next;
}
