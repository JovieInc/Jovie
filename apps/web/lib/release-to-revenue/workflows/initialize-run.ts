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
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  getStripeConnectReadiness,
  isStripeConnectChargesReady,
} from '@/lib/stripe/connect-readiness';
import { logger } from '@/lib/utils/logger';
import { generateDistributionDraftsForRun } from '../distribution-drafts';
import {
  normalizeStoreListing,
  syncStoreListingForRun,
} from '../store-listing';
import type {
  ReleaseToRevenueRunStepOutputs,
  ReleaseToRevenueStoreListing,
} from '../types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '../types';

interface InitializeReleaseToRevenueRunInput {
  readonly workflowRunId: string;
}

/**
 * Fail-closed Stripe Connect check for the merch selling step. The account id
 * is resolved live from the run's owning creator profile so runs triggered
 * before a Connect onboarding finish still gate on the current state.
 */
async function isSellingStepConnectReady(
  stepOutputs: ReleaseToRevenueRunStepOutputs
): Promise<boolean> {
  const creatorProfileId = stepOutputs.designPartner?.creatorProfileId;
  if (!creatorProfileId) {
    return false;
  }

  const [profile] = await db
    .select({ stripeAccountId: creatorProfiles.stripeAccountId })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile?.stripeAccountId) {
    return false;
  }

  return isStripeConnectChargesReady(
    await getStripeConnectReadiness(profile.stripeAccountId)
  );
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

  const sellingConnectReady = await isSellingStepConnectReady(stepOutputs);

  const [distributionDrafts, storeListing] = await Promise.all([
    generateDistributionDraftsForRun({ stepOutputs }),
    sellingConnectReady
      ? syncStoreListingForRun({
          workflowRunId: input.workflowRunId,
          stepOutputs,
        })
      : Promise.resolve<ReleaseToRevenueStoreListing>({
          ...normalizeStoreListing(stepOutputs.storeListing),
          status: 'connect-not-ready',
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
    storeListingStatus: storeListing.status ?? 'synced',
  });
}
