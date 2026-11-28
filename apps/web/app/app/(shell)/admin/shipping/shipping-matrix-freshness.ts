import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { formatTimeAgo } from '@/lib/utils/date-formatting';

type TaskFeed = ShippingCockpitProjection['operationalTasks'];

/**
 * One freshness decision for the header and empty table (JOV-8961).
 * Zero counts are reserved for a fresh complete feed. Known cached rows may
 * still be shown under an explicit stale/syncing label.
 */
export function matrixSummary(
  query: Readonly<{ isPending: boolean; isError: boolean }>,
  rowCount: number,
  attentionCount: number,
  feed: Pick<TaskFeed, 'syncState'> | undefined
): string {
  if (query.isPending) return 'Loading in-flight work…';
  if (query.isError || !feed || feed.syncState === 'failed') {
    return 'UNKNOWN — observation failed. Refresh to retry.';
  }
  if (feed.syncState === 'syncing') {
    if (rowCount > 0) {
      return `${rowCount} open · ${attentionCount} need attention · syncing cache`;
    }
    return 'Syncing in-flight work…';
  }
  if (feed.syncState === 'stale') {
    if (rowCount > 0) {
      return `${rowCount} open · ${attentionCount} need attention · stale cache`;
    }
    return 'In-flight work is unknown until the next sync.';
  }
  return `${rowCount} open · ${attentionCount} need attention · fresh cache`;
}

/**
 * An empty matrix means "no open lane PRs" only on a fresh observation.
 * Failed, stale, or syncing caches leave in-flight work unknown, never zero.
 */
export function emptyMatrixMessage(
  isError: boolean,
  feed: Pick<TaskFeed, 'syncState' | 'lastSyncedAt'> | undefined
): string {
  if (isError || !feed || feed.syncState === 'failed') {
    return 'Work matrix unavailable. In-flight work is unknown.';
  }
  if (feed.syncState === 'stale') {
    return `Shipping cache is stale (${feed.lastSyncedAt ? `last synced ${formatTimeAgo(feed.lastSyncedAt)}` : 'never synced'}). In-flight work is unknown until the next sync.`;
  }
  if (feed.syncState === 'syncing') return 'Syncing in-flight work…';
  return 'No open lane pull requests.';
}
