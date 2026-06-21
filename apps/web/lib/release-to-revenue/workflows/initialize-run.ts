/**
 * Workflow executor: release_to_revenue
 *
 * Materializes distribution drafts (3 social posts + 1 SMS) and parks the run
 * for human approval. Nothing dispatches until a draft is explicitly approved.
 */

import { and, eq } from 'drizzle-orm';
import { markWorkflowFailed } from '@/lib/connectors/workflows/execute-approved-action';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';
import { generateDistributionDraftsForRun } from '../distribution-drafts';
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

  const [distributionDrafts, storeListing] = await Promise.all([
    generateDistributionDraftsForRun({ stepOutputs }),
    syncStoreListingForRun({
      workflowRunId: input.workflowRunId,
      stepOutputs,
    }),
  ]);

  await db
    .update(workflowRuns)
    .set({
      status: 'waiting_for_approval',
      currentStep: 'awaiting_approval',
      stepOutputs: {
        ...stepOutputs,
        distributionDrafts,
        storeListing,
      },
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
    draftCount: distributionDrafts.items.length,
    merchCardIds: storeListing.merchCardIds,
  });
}
