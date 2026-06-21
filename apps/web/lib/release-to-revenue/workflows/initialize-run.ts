/**
 * Workflow executor: release_to_revenue
 *
 * v1 only materializes the autopilot run record and parks it for downstream
 * human approval. Merch, social drafts, and SMS generation land in follow-on PRs.
 */

import { and, eq } from 'drizzle-orm';
import { markWorkflowFailed } from '@/lib/connectors/workflows/execute-approved-action';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';
import { syncStoreListingForRun } from '../store-listing';
import type { ReleaseToRevenueRunStepOutputs } from '../types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '../types';

interface InitializeReleaseToRevenueRunInput {
  readonly workflowRunId: string;
}

export async function initializeReleaseToRevenueRun(
  input: InitializeReleaseToRevenueRunInput
): Promise<void> {
  const [run] = await db
    .select({
      id: workflowRuns.id,
      kind: workflowRuns.kind,
      stepOutputs: workflowRuns.stepOutputs,
    })
    .from(workflowRuns)
    .where(eq(workflowRuns.id, input.workflowRunId))
    .limit(1);

  if (!run || run.kind !== RELEASE_TO_REVENUE_WORKFLOW_KIND) {
    await markWorkflowFailed(
      input.workflowRunId,
      'release_to_revenue run missing or wrong kind'
    );
    return;
  }

  const stepOutputs = run.stepOutputs as ReleaseToRevenueRunStepOutputs;
  if (!stepOutputs?.release?.title) {
    await markWorkflowFailed(
      input.workflowRunId,
      'release_to_revenue run is missing release metadata'
    );
    return;
  }

  const storeListing = await syncStoreListingForRun({
    workflowRunId: input.workflowRunId,
    stepOutputs,
  });

  await db
    .update(workflowRuns)
    .set({
      status: 'waiting_for_approval',
      currentStep: 'awaiting_approval',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRuns.id, input.workflowRunId),
        eq(workflowRuns.status, 'running')
      )
    );

  logger.info('[release-to-revenue] run initialized and awaiting approval', {
    workflowRunId: input.workflowRunId,
    releaseId: stepOutputs.releaseId,
    title: stepOutputs.release.title,
    merchCardIds: storeListing.merchCardIds,
  });
}
