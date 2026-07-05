/**
 * Agent task result log — workflow-level metrics (#12145).
 *
 * Records one `workflow_step_results` row per executed workflow step and
 * derives multi-agent contribution metrics:
 * - agent task success rate
 * - % tasks requiring human override
 * - automation throughput per agent
 * - cost per revenue opportunity identified (Σ cost / count suggested_actions)
 * - time-to-resolution per workflow chain (sum of step latencies)
 * - hallucination correction rate (retried / total)
 *
 * LLM-level cost observability lives in Agnost/OpenTelemetry (#10360); this
 * module is the workflow-run-level result layer that reconciles against it.
 */

import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowStepResults } from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowStepResultStatus =
  | 'success'
  | 'failed'
  | 'human_override'
  | 'retried';

export interface RecordWorkflowStepResultInput {
  readonly runId: string;
  readonly step: string;
  readonly agent: string;
  readonly status: WorkflowStepResultStatus;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
  readonly costUsd?: number | null;
  readonly latencyMs?: number | null;
  readonly linkedOpportunityId?: string | null;
}

export interface AgentTaskMetricsRow {
  readonly agent: string;
  /** Total step results in window (throughput per agent). */
  readonly totalTasks: number;
  /** success / total. */
  readonly successRate: number;
  /** human_override / total. */
  readonly humanOverrideRate: number;
  /** retried / total (hallucination correction rate). */
  readonly retriedRate: number;
  /** Σ cost_usd in window. */
  readonly totalCostUsd: number;
  /** Σ cost_usd / count(distinct linked_opportunity_id); null when no opportunities linked. */
  readonly costPerOpportunityUsd: number | null;
  /** Median of per-run summed step latency (time-to-resolution per workflow chain), ms. */
  readonly medianTimeToResolutionMs: number | null;
}

export interface AgentTaskMetricsWindow {
  readonly since: Date;
  readonly until: Date;
}

// ---------------------------------------------------------------------------
// Record (fail-soft — instrumentation must never break the workflow)
// ---------------------------------------------------------------------------

export async function recordWorkflowStepResult(
  input: RecordWorkflowStepResultInput
): Promise<void> {
  try {
    await db.insert(workflowStepResults).values({
      runId: input.runId,
      step: input.step,
      agent: input.agent,
      status: input.status,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
      costUsd: input.costUsd != null ? input.costUsd.toFixed(6) : null,
      latencyMs: input.latencyMs ?? null,
      linkedOpportunityId: input.linkedOpportunityId ?? null,
    });
  } catch (err) {
    // Fail-soft: a metrics write must never fail the workflow it observes.
    logger.error('[agent-task-metrics] failed to record step result', {
      runId: input.runId,
      step: input.step,
      agent: input.agent,
      err,
    });
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Per-agent metrics over a time window. One query, grouped by agent.
 */
export async function getAgentTaskMetrics(
  window: AgentTaskMetricsWindow
): Promise<AgentTaskMetricsRow[]> {
  const result = await db.execute<{
    agent: string;
    total_tasks: number;
    success_count: number;
    override_count: number;
    retried_count: number;
    total_cost_usd: string | null;
    opportunity_count: number;
    median_ttr_ms: number | null;
  }>(drizzleSql`
    WITH step_rows AS (
      SELECT *
      FROM workflow_step_results
      WHERE created_at >= ${window.since} AND created_at < ${window.until}
    ),
    run_latency AS (
      SELECT agent, run_id, SUM(COALESCE(latency_ms, 0)) AS run_latency_ms
      FROM step_rows
      GROUP BY agent, run_id
    ),
    run_median AS (
      SELECT
        agent,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY run_latency_ms) AS median_ttr_ms
      FROM run_latency
      GROUP BY agent
    )
    SELECT
      s.agent,
      COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE s.status = 'success')::int AS success_count,
      COUNT(*) FILTER (WHERE s.status = 'human_override')::int AS override_count,
      COUNT(*) FILTER (WHERE s.status = 'retried')::int AS retried_count,
      SUM(s.cost_usd) AS total_cost_usd,
      COUNT(DISTINCT s.linked_opportunity_id) FILTER (
        WHERE s.linked_opportunity_id IS NOT NULL
      )::int AS opportunity_count,
      MAX(m.median_ttr_ms) AS median_ttr_ms
    FROM step_rows s
    LEFT JOIN run_median m ON m.agent = s.agent
    GROUP BY s.agent
    ORDER BY s.agent
  `);

  const rows =
    (
      result as {
        rows?: Array<{
          agent: string;
          total_tasks: number;
          success_count: number;
          override_count: number;
          retried_count: number;
          total_cost_usd: string | null;
          opportunity_count: number;
          median_ttr_ms: number | null;
        }>;
      }
    ).rows ?? [];

  return rows.map(row => {
    const total = Number(row.total_tasks) || 0;
    const totalCost =
      row.total_cost_usd == null ? 0 : Number(row.total_cost_usd);
    const opportunities = Number(row.opportunity_count) || 0;
    return {
      agent: row.agent,
      totalTasks: total,
      successRate: total > 0 ? Number(row.success_count) / total : 0,
      humanOverrideRate: total > 0 ? Number(row.override_count) / total : 0,
      retriedRate: total > 0 ? Number(row.retried_count) / total : 0,
      totalCostUsd: totalCost,
      costPerOpportunityUsd:
        opportunities > 0 ? totalCost / opportunities : null,
      medianTimeToResolutionMs:
        row.median_ttr_ms == null ? null : Number(row.median_ttr_ms),
    };
  });
}
