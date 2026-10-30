/**
 * Price-change notice metrics for Ovie (billing/revenue area): notices
 * scheduled, sent and failed, and the time from scheduling to fully notified.
 * Pure summarizer; the server reader is in metrics.server.ts.
 */

import type { ChangeState } from './store';
import type { NoticeRow } from './types';

export interface PriceChangeNoticeMetrics {
  readonly changes: number;
  readonly held: number;
  readonly scheduled: number;
  readonly sent: number;
  readonly failed: number;
  readonly bounced: number;
  readonly pending: number;
  readonly applied: number;
  /** Seconds from scheduling to fully notified, one entry per fully-notified change. */
  readonly timeToFullyNotifiedSeconds: readonly number[];
  readonly p50TimeToFullyNotifiedSeconds: number | null;
  readonly p95TimeToFullyNotifiedSeconds: number | null;
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? null;
}

export function summarizePriceChangeNotices(
  changes: readonly ChangeState[],
  notices: readonly NoticeRow[]
): PriceChangeNoticeMetrics {
  const durations = changes
    .filter(change => change.fullyNotifiedAt)
    .map(change =>
      Math.max(
        0,
        Math.round(
          ((change.fullyNotifiedAt as Date).getTime() -
            change.scheduledAt.getTime()) /
            1000
        )
      )
    )
    .sort((a, b) => a - b);
  const count = (...statuses: string[]) =>
    notices.filter(row => statuses.includes(row.status)).length;
  return {
    changes: changes.length,
    held: changes.filter(change => change.status === 'held').length,
    scheduled: notices.length,
    sent: count('sent'),
    failed: count('failed', 'no_recipient', 'permanent_bounce'),
    bounced: count('bounced', 'permanent_bounce'),
    pending: count('queued', 'sending'),
    applied: notices.filter(row => row.appliedAt).length,
    timeToFullyNotifiedSeconds: durations,
    p50TimeToFullyNotifiedSeconds: percentile(durations, 0.5),
    p95TimeToFullyNotifiedSeconds: percentile(durations, 0.95),
  };
}
