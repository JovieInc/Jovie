import 'server-only';

import { and, asc, sql as drizzleSql, eq, isNull, lt, or } from 'drizzle-orm';
import {
  RELEASE_OUTCOME_MEASUREMENT_WINDOW_DAYS,
  recordWorkflowRunOutcome,
} from '@/lib/connectors/workflows/outcome-attribution';
import { db } from '@/lib/db';
import { workflowRunOutcomes, workflowRuns } from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MAX_RELEASE_OUTCOME_RECONCILIATIONS_PER_TICK = 25;
const MAX_CONCURRENT_RELEASE_OUTCOME_RECONCILIATIONS = 5;

interface ReleaseOutcomeCandidate {
  readonly workflowRunId: string;
  readonly windowStart: Date | null;
  readonly windowEnd: Date | null;
}

export interface ReleaseOutcomeReconciliationSummary {
  readonly scanned: number;
  readonly attempted: number;
  readonly reconciled: number;
  readonly unavailable: number;
  readonly failed: number;
}

/** Avoid rewriting a snapshot when its bounded as-of endpoint has not advanced. */
export function needsReleaseOutcomeReconciliation(input: {
  readonly windowStart: Date | null;
  readonly windowEnd: Date | null;
  readonly asOf: Date;
}): boolean {
  if (!input.windowStart || !input.windowEnd) {
    return true;
  }

  const maturityAt = new Date(
    input.windowStart.getTime() +
      RELEASE_OUTCOME_MEASUREMENT_WINDOW_DAYS * MS_PER_DAY
  );
  const targetEnd = new Date(
    Math.min(input.asOf.getTime(), maturityAt.getTime())
  );
  return input.windowEnd.getTime() < targetEnd.getTime();
}

async function loadReleaseOutcomeCandidates(
  limit: number
): Promise<ReleaseOutcomeCandidate[]> {
  return db
    .select({
      workflowRunId: workflowRuns.id,
      windowStart: workflowRunOutcomes.windowStart,
      windowEnd: workflowRunOutcomes.windowEnd,
    })
    .from(workflowRuns)
    .leftJoin(
      workflowRunOutcomes,
      eq(workflowRunOutcomes.workflowRunId, workflowRuns.id)
    )
    .where(
      and(
        eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND),
        eq(workflowRuns.status, 'completed'),
        drizzleSql<boolean>`jsonb_path_exists(${workflowRuns.stepOutputs}, '$.distributionDrafts.items[*] ? (@.status == "dispatched")')`,
        or(
          isNull(workflowRunOutcomes.id),
          lt(
            workflowRunOutcomes.windowEnd,
            drizzleSql`${workflowRunOutcomes.windowStart} + (${RELEASE_OUTCOME_MEASUREMENT_WINDOW_DAYS} * interval '1 day')`
          )
        )
      )
    )
    .orderBy(
      drizzleSql`${workflowRunOutcomes.windowEnd} asc nulls first`,
      asc(workflowRuns.createdAt)
    )
    .limit(limit);
}

/**
 * Recompute incomplete release outcome snapshots without letting one bad run
 * block the rest of the bounded daily batch.
 */
export async function reconcileReleaseWorkflowRunOutcomes(
  input: { readonly asOf?: Date; readonly limit?: number } = {}
): Promise<ReleaseOutcomeReconciliationSummary> {
  const asOf = input.asOf ?? new Date();
  const limit = Math.min(
    MAX_RELEASE_OUTCOME_RECONCILIATIONS_PER_TICK,
    Math.max(1, input.limit ?? MAX_RELEASE_OUTCOME_RECONCILIATIONS_PER_TICK)
  );
  const candidates = await loadReleaseOutcomeCandidates(limit);
  const dueCandidates = candidates.filter(candidate =>
    needsReleaseOutcomeReconciliation({
      windowStart: candidate.windowStart,
      windowEnd: candidate.windowEnd,
      asOf,
    })
  );

  const settled: PromiseSettledResult<
    Awaited<ReturnType<typeof recordWorkflowRunOutcome>>
  >[] = [];
  for (
    let index = 0;
    index < dueCandidates.length;
    index += MAX_CONCURRENT_RELEASE_OUTCOME_RECONCILIATIONS
  ) {
    const batch = dueCandidates.slice(
      index,
      index + MAX_CONCURRENT_RELEASE_OUTCOME_RECONCILIATIONS
    );
    settled.push(
      ...(await Promise.allSettled(
        batch.map(candidate =>
          recordWorkflowRunOutcome(candidate.workflowRunId, { asOf })
        )
      ))
    );
  }

  let reconciled = 0;
  let unavailable = 0;
  let failed = 0;

  settled.forEach((result, index) => {
    if (result.status === 'rejected') {
      failed++;
      logger.warn('[release-outcome-reconciliation] run failed', {
        workflowRunId: dueCandidates[index]?.workflowRunId,
        error: result.reason,
      });
      return;
    }

    if (result.value) {
      reconciled++;
    } else {
      unavailable++;
    }
  });

  return {
    scanned: candidates.length,
    attempted: dueCandidates.length,
    reconciled,
    unavailable,
    failed,
  };
}
