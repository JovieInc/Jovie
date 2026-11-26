/**
 * Shared action ranking / overflow partition for table rows and drawer headers.
 *
 * Drift DRI-22 / taste decision 8: one ranking system. Callsites must not invent
 * local "top N inline, rest in ⋯" rules — use `partitionRankedActions`.
 */

/** Max inline primary actions before remaining verbs collapse into the ⋯ menu. */
export const ACTION_OVERFLOW_MAX_PRIMARY = 2;

/** Default priority for ordinary actions (lower = more primary). */
export const ACTION_RANK_DEFAULT = 100;

/** Default priority for destructive actions (kept out of the primary strip). */
export const ACTION_RANK_DESTRUCTIVE = 1000;

export type ActionPlacement = 'primary' | 'overflow';

export interface RankableAction {
  readonly id: string;
  /**
   * Sort key for the primary strip. Lower wins. Omit to use
   * `ACTION_RANK_DEFAULT`, or `ACTION_RANK_DESTRUCTIVE` when `destructive`.
   */
  readonly priority?: number;
  /**
   * Force placement. `primary` still respects `maxPrimary` capacity (earlier
   * forced primaries win). `overflow` never appears inline.
   */
  readonly placement?: ActionPlacement;
  /** When true and `priority` is omitted, uses `ACTION_RANK_DESTRUCTIVE`. */
  readonly destructive?: boolean;
}

export interface PartitionRankedActionsOptions {
  readonly maxPrimary?: number;
}

export interface PartitionedActions<T extends RankableAction> {
  readonly primary: readonly T[];
  readonly overflow: readonly T[];
}

function resolvePriority(action: RankableAction): number {
  if (typeof action.priority === 'number') {
    return action.priority;
  }
  return action.destructive ? ACTION_RANK_DESTRUCTIVE : ACTION_RANK_DEFAULT;
}

/**
 * Split ranked actions into an inline primary strip and an overflow menu list.
 *
 * Rules:
 * 1. `placement: 'overflow'` always overflows.
 * 2. Remaining actions sort by priority (asc), then stable input order.
 * 3. Up to `maxPrimary` (default `ACTION_OVERFLOW_MAX_PRIMARY`) become primary;
 *    the rest overflow. Forced `placement: 'primary'` fills the strip first.
 */
export function partitionRankedActions<T extends RankableAction>(
  actions: readonly T[],
  options: PartitionRankedActionsOptions = {}
): PartitionedActions<T> {
  const maxPrimary = Math.max(
    0,
    options.maxPrimary ?? ACTION_OVERFLOW_MAX_PRIMARY
  );

  if (actions.length === 0 || maxPrimary === 0) {
    return { primary: [], overflow: [...actions] };
  }

  const forcedOverflow: T[] = [];
  const forcedPrimary: T[] = [];
  const flexible: Array<{ action: T; index: number; priority: number }> = [];

  actions.forEach((action, index) => {
    if (action.placement === 'overflow') {
      forcedOverflow.push(action);
      return;
    }
    if (action.placement === 'primary') {
      forcedPrimary.push(action);
      return;
    }
    flexible.push({
      action,
      index,
      priority: resolvePriority(action),
    });
  });

  flexible.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.index - b.index;
  });

  const primary: T[] = [];
  const overflow: T[] = [...forcedOverflow];

  for (const action of forcedPrimary) {
    if (primary.length < maxPrimary) {
      primary.push(action);
    } else {
      overflow.push(action);
    }
  }

  for (const { action } of flexible) {
    if (primary.length < maxPrimary) {
      primary.push(action);
    } else {
      overflow.push(action);
    }
  }

  return { primary, overflow };
}
