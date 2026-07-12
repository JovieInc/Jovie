/**
 * Skill run telemetry writers/readers (JOV-3946).
 *
 * Fail-open: a telemetry outage must never break skill execution.
 * Stores in local Postgres skill_run_events (Eve-readable; no new SaaS).
 */

import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import {
  DEFAULT_SKILL_VERSION,
  type SkillLifecycle,
} from '@/lib/agents/lifecycle';
import type {
  SkillRunMetricsRow,
  SkillRunStatus,
} from '@/lib/agents/telemetry-metrics';
import { db } from '@/lib/db';
import { skillRunEvents } from '@/lib/db/schema/agents';
import { logger } from '@/lib/utils/logger';

export { aggregateSkillRunFixtures } from '@/lib/agents/telemetry-metrics';
export type { SkillRunMetricsRow, SkillRunStatus };

export interface RecordSkillRunEventInput {
  readonly invocationId: string;
  readonly skillId: string;
  readonly skillVersion?: string;
  readonly userId?: string | null;
  readonly status: SkillRunStatus;
  readonly startedAt?: Date;
  readonly completedAt?: Date | null;
  readonly durationMs?: number | null;
  readonly model?: string | null;
  readonly tokenCost?: number | null;
  readonly costUsd?: number | null;
  readonly feedbackVote?: 'up' | 'down' | null;
  readonly successMetricName?: string | null;
  readonly successMetricOutcome?: Record<string, unknown> | null;
  readonly error?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly lifecycle?: SkillLifecycle;
}

export interface SkillRunMetricsWindow {
  readonly since: Date;
  readonly until: Date;
  readonly skillId?: string;
}

function isMissingSkillRunTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  if (candidate.code === '42P01' || candidate.code === '42703') {
    return true;
  }
  if (isMissingSkillRunTableError(candidate.cause)) {
    return true;
  }
  return (
    typeof candidate.message === 'string' &&
    (candidate.message.includes('skill_run_events') ||
      candidate.message.includes('does not exist'))
  );
}

/**
 * Upsert one event row per invocation_id (idempotent on retries).
 * Fail-open: swallows DB errors after logging.
 */
export async function recordSkillRunEvent(
  input: RecordSkillRunEventInput
): Promise<void> {
  const startedAt = input.startedAt ?? new Date();
  const completedAt =
    input.status === 'started'
      ? (input.completedAt ?? null)
      : (input.completedAt ?? new Date());
  const durationMs =
    input.durationMs ??
    (completedAt ? completedAt.getTime() - startedAt.getTime() : null);

  try {
    await db
      .insert(skillRunEvents)
      .values({
        invocationId: input.invocationId,
        skillId: input.skillId,
        skillVersion: input.skillVersion ?? DEFAULT_SKILL_VERSION,
        userId: input.userId ?? null,
        status: input.status,
        startedAt,
        completedAt,
        durationMs,
        model: input.model ?? null,
        tokenCost: input.tokenCost ?? null,
        costUsd: input.costUsd != null ? input.costUsd.toFixed(6) : null,
        feedbackVote: input.feedbackVote ?? null,
        successMetricName: input.successMetricName ?? null,
        successMetricOutcome: input.successMetricOutcome ?? null,
        error: input.error ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
        },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: skillRunEvents.invocationId,
        set: {
          status: input.status,
          completedAt,
          durationMs,
          model: input.model ?? null,
          tokenCost: input.tokenCost ?? null,
          costUsd: input.costUsd != null ? input.costUsd.toFixed(6) : null,
          feedbackVote: input.feedbackVote ?? null,
          successMetricName: input.successMetricName ?? null,
          successMetricOutcome: input.successMetricOutcome ?? null,
          error: input.error ?? null,
          metadata: {
            ...(input.metadata ?? {}),
            ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
          },
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    logger.error('[skill-telemetry] failed to record skill run event', {
      invocationId: input.invocationId,
      skillId: input.skillId,
      migrationDrift: isMissingSkillRunTableError(err),
      err,
    });
  }
}

/**
 * Per skill+version rollups for the promotion engine + admin ledger.
 */
export async function getSkillRunMetrics(
  window: SkillRunMetricsWindow
): Promise<SkillRunMetricsRow[]> {
  try {
    const result = await db.execute<{
      skill_id: string;
      skill_version: string;
      run_count: number;
      completed_count: number;
      error_count: number;
      negative_feedback_count: number;
      feedback_count: number;
      median_cost_usd: number | null;
      success_metric_name: string | null;
      outcomes_recorded: number;
    }>(drizzleSql`
      SELECT
        skill_id,
        skill_version,
        COUNT(*)::int AS run_count,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        COUNT(*) FILTER (WHERE status = 'error')::int AS error_count,
        COUNT(*) FILTER (WHERE feedback_vote = 'down')::int AS negative_feedback_count,
        COUNT(*) FILTER (WHERE feedback_vote IS NOT NULL)::int AS feedback_count,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY cost_usd
        ) FILTER (WHERE cost_usd IS NOT NULL) AS median_cost_usd,
        MAX(success_metric_name) AS success_metric_name,
        COUNT(*) FILTER (
          WHERE success_metric_outcome IS NOT NULL
        )::int AS outcomes_recorded
      FROM skill_run_events
      WHERE started_at >= ${window.since}
        AND started_at < ${window.until}
        ${
          window.skillId
            ? drizzleSql`AND skill_id = ${window.skillId}`
            : drizzleSql``
        }
      GROUP BY skill_id, skill_version
      ORDER BY skill_id, skill_version
    `);

    const rows =
      (
        result as {
          rows?: Array<{
            skill_id: string;
            skill_version: string;
            run_count: number;
            completed_count: number;
            error_count: number;
            negative_feedback_count: number;
            feedback_count: number;
            median_cost_usd: number | null;
            success_metric_name: string | null;
            outcomes_recorded: number;
          }>;
        }
      ).rows ?? [];

    return rows.map(row => {
      const runCount = Number(row.run_count) || 0;
      const feedbackCount = Number(row.feedback_count) || 0;
      return {
        skillId: row.skill_id,
        skillVersion: row.skill_version,
        runCount,
        completionRate:
          runCount > 0 ? Number(row.completed_count) / runCount : 0,
        errorRate: runCount > 0 ? Number(row.error_count) / runCount : 0,
        negativeFeedbackRate:
          feedbackCount > 0
            ? Number(row.negative_feedback_count) / feedbackCount
            : 0,
        medianCostUsd:
          row.median_cost_usd == null ? null : Number(row.median_cost_usd),
        successMetricSummary: {
          named: row.success_metric_name,
          outcomesRecorded: Number(row.outcomes_recorded) || 0,
        },
      };
    });
  } catch (err) {
    if (isMissingSkillRunTableError(err)) {
      return [];
    }
    throw err;
  }
}
