/**
 * Opportunity lifecycle cycle-time (#12140).
 *
 * cycle_time = workflow_runs.shipped_at − suggested_actions.detected_at,
 * linked via workflow_runs.step_outputs ->> 'approvalId'.
 *
 * Aggregates median + p90 cycle time per opportunity type (suggested_actions.kind)
 * and per artist (user), over a rolling window (default 30 days).
 */

import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';

export interface OpportunityCycleTimeQuery {
  /** Window start (default: 30 days ago). */
  readonly since?: Date;
  /** Window end (default: now). */
  readonly until?: Date;
  /** Restrict to one artist/user. */
  readonly userId?: string;
}

export interface OpportunityCycleTimeRow {
  readonly userId: string;
  /** Opportunity type = suggested_actions.kind. */
  readonly kind: string;
  readonly shippedCount: number;
  readonly medianCycleTimeMs: number;
  readonly p90CycleTimeMs: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Median + p90 opportunity→ship cycle time per artist, per opportunity type.
 * Only counts opportunities whose linked run actually shipped in the window.
 */
export async function getOpportunityCycleTime(
  query: OpportunityCycleTimeQuery = {}
): Promise<OpportunityCycleTimeRow[]> {
  const until = query.until ?? new Date();
  const since = query.since ?? new Date(until.getTime() - THIRTY_DAYS_MS);

  const userFilter = query.userId
    ? drizzleSql`AND sa.user_id = ${query.userId}`
    : drizzleSql``;

  const result = await db.execute<{
    user_id: string;
    kind: string;
    shipped_count: number;
    median_cycle_ms: number | null;
    p90_cycle_ms: number | null;
  }>(drizzleSql`
    WITH shipped AS (
      SELECT
        sa.user_id,
        sa.kind,
        EXTRACT(EPOCH FROM (wr.shipped_at - sa.detected_at)) * 1000
          AS cycle_ms
      FROM workflow_runs wr
      JOIN suggested_actions sa
        ON sa.id = (wr.step_outputs ->> 'approvalId')::uuid
      WHERE wr.shipped_at IS NOT NULL
        AND wr.shipped_at >= ${since}
        AND wr.shipped_at < ${until}
        AND wr.step_outputs ->> 'approvalId' IS NOT NULL
        ${userFilter}
    )
    SELECT
      user_id,
      kind,
      COUNT(*)::int AS shipped_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cycle_ms) AS median_cycle_ms,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY cycle_ms) AS p90_cycle_ms
    FROM shipped
    GROUP BY user_id, kind
    ORDER BY user_id, kind
  `);

  const rows =
    (
      result as {
        rows?: Array<{
          user_id: string;
          kind: string;
          shipped_count: number;
          median_cycle_ms: number | null;
          p90_cycle_ms: number | null;
        }>;
      }
    ).rows ?? [];

  return rows.map(row => ({
    userId: row.user_id,
    kind: row.kind,
    shippedCount: Number(row.shipped_count) || 0,
    medianCycleTimeMs: Math.max(0, Number(row.median_cycle_ms ?? 0)),
    p90CycleTimeMs: Math.max(0, Number(row.p90_cycle_ms ?? 0)),
  }));
}
