import 'server-only';

import { and, eq, isNotNull, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { merchGenerationBatches } from '@/lib/db/schema/merch';
import { RELEASE_AUTOPILOT_MERCH_COMMAND } from '@/lib/services/release-autopilot/types';
import type {
  ReleaseToRevenueRunStepOutputs,
  ReleaseToRevenueStoreListing,
} from './types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from './types';

const RELEASE_ID_PROMPT_PREFIX = 'release_id:';

function releasePromptPrefix(releaseId: string): string {
  return `${RELEASE_ID_PROMPT_PREFIX}${releaseId}`;
}

export function normalizeStoreListing(
  storeListing: ReleaseToRevenueStoreListing | undefined
): ReleaseToRevenueStoreListing {
  const merchCardIds = storeListing?.merchCardIds ?? [];
  const uniqueIds = [
    ...new Set(merchCardIds.filter(id => id.trim().length > 0)),
  ];
  return { merchCardIds: uniqueIds };
}

export function mergeStoreListingMerchCardIds(
  storeListing: ReleaseToRevenueStoreListing | undefined,
  merchCardIds: readonly string[]
): ReleaseToRevenueStoreListing {
  const current = normalizeStoreListing(storeListing);
  return normalizeStoreListing({
    merchCardIds: [...current.merchCardIds, ...merchCardIds],
  });
}

/**
 * Resolve the merch cards generated for a release, scoped to the owning creator.
 *
 * The `creatorProfileId` predicate is the tenant-isolation boundary: without it,
 * one creator's release run could pick up another creator's merch cards that share
 * the same `release_id:` prompt prefix (JOV cross-tenant GMV leak). Always pass the
 * owning creator profile id; an empty id fails closed and returns no cards.
 */
export async function findMerchCardIdsForRelease(
  releaseId: string,
  creatorProfileId: string
): Promise<string[]> {
  // Fail closed: an empty owner would search across tenants, and an empty
  // releaseId would match every release-prefixed batch (`release_id:%`).
  if (!creatorProfileId || !releaseId) {
    return [];
  }

  const batches = await db
    .select({
      merchCardId: merchGenerationBatches.selectedMerchCardId,
    })
    .from(merchGenerationBatches)
    .where(
      and(
        eq(merchGenerationBatches.creatorProfileId, creatorProfileId),
        eq(merchGenerationBatches.command, RELEASE_AUTOPILOT_MERCH_COMMAND),
        like(
          merchGenerationBatches.prompt,
          `${releasePromptPrefix(releaseId)}%`
        ),
        isNotNull(merchGenerationBatches.selectedMerchCardId)
      )
    );

  return [
    ...new Set(
      batches
        .map(batch => batch.merchCardId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];
}

export async function resolveMerchCardIdsForRun(
  stepOutputs: ReleaseToRevenueRunStepOutputs
): Promise<string[]> {
  const linked = normalizeStoreListing(stepOutputs.storeListing).merchCardIds;
  if (linked.length > 0) {
    return [...linked];
  }

  if (!stepOutputs.releaseId) {
    return [];
  }

  // Owner-scope the discovery query to the run's creator. Fail closed when the
  // owner is missing rather than searching across every tenant's merch cards.
  const creatorProfileId = stepOutputs.designPartner?.creatorProfileId;
  if (!creatorProfileId) {
    return [];
  }

  return findMerchCardIdsForRelease(stepOutputs.releaseId, creatorProfileId);
}

export async function linkMerchCardToReleaseRun(input: {
  readonly workflowRunId: string;
  readonly merchCardId: string;
}): Promise<ReleaseToRevenueStoreListing> {
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
    throw new Error('Release-to-revenue workflow run not found');
  }

  const stepOutputs = run.stepOutputs as ReleaseToRevenueRunStepOutputs;
  const storeListing = mergeStoreListingMerchCardIds(stepOutputs.storeListing, [
    input.merchCardId,
  ]);

  await db
    .update(workflowRuns)
    .set({
      stepOutputs: {
        ...stepOutputs,
        storeListing,
      },
      updatedAt: new Date(),
    })
    .where(eq(workflowRuns.id, input.workflowRunId));

  return storeListing;
}

export async function syncStoreListingForRun(input: {
  readonly workflowRunId: string;
  readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
}): Promise<ReleaseToRevenueStoreListing> {
  const discovered = await resolveMerchCardIdsForRun(input.stepOutputs);
  if (discovered.length === 0) {
    return normalizeStoreListing(input.stepOutputs.storeListing);
  }

  const storeListing = mergeStoreListingMerchCardIds(
    input.stepOutputs.storeListing,
    discovered
  );

  await db
    .update(workflowRuns)
    .set({
      stepOutputs: {
        ...input.stepOutputs,
        storeListing,
      },
      updatedAt: new Date(),
    })
    .where(eq(workflowRuns.id, input.workflowRunId));

  return storeListing;
}
