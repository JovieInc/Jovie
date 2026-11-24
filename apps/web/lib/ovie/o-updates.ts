/**
 * Opt-in contract for the O's update reveal. A query declares what a change
 * means through `meta.oUpdate`; nothing about the query's fetch changes.
 * `useOUpdates` (components/organisms/o-presence) reads it from the cache.
 */

import { replaceEqualDeep } from '@tanstack/react-query';

export interface OUpdateSpec<TData = unknown> {
  /** Stable id for this source, unique across queries. */
  readonly key: string;
  /** Plain words for a change, given the count of changed items. */
  readonly label: string | ((count: number) => string);
  /** Where the update link goes. */
  readonly href?: string;
  /**
   * How many items changed between two reads. 0 means nothing to show.
   * Omitted: a structurally equal read is 0 and any other change is 1.
   */
  countChanged?(previous: TData, next: TData): number;
}

export type OUpdateMeta = OUpdateSpec | readonly OUpdateSpec[];

export function oUpdateSpecs(meta: unknown): readonly OUpdateSpec[] {
  const value = (meta as { oUpdate?: OUpdateMeta } | undefined)?.oUpdate;
  if (!value) return [];
  return Array.isArray(value) ? value : [value as OUpdateSpec];
}

/** Count changed items for one spec. Never throws; a failure counts as 0. */
export function countOUpdate(
  spec: OUpdateSpec,
  previous: unknown,
  next: unknown
): number {
  if (previous === next) return 0;
  try {
    const count = spec.countChanged
      ? spec.countChanged(previous, next)
      : replaceEqualDeep(previous, next) === previous
        ? 0
        : 1;
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  } catch {
    return 0;
  }
}

export function oUpdateLabel(spec: OUpdateSpec, count: number): string {
  return typeof spec.label === 'function' ? spec.label(count) : spec.label;
}

/** "1 change shipped" / "3 changes shipped". */
export const countLabel =
  (one: string, many: string) =>
  (count: number): string =>
    `${count} ${count === 1 ? one : many}`;
