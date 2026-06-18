import 'server-only';

import { and, eq, isNotNull, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { merchCards, merchGenerationBatches } from '@/lib/db/schema/merch';
import { upsertLibraryApprovalStatus } from '@/lib/library/approval-status.server';
import { MERCH_DEFAULT_PRINTFUL_PRODUCT } from '@/lib/merch/default-catalog';
import { createMerchGeneration, selectMerchDesign } from '@/lib/merch/service';
import {
  RELEASE_AUTOPILOT_MERCH_COMMAND,
  type ReleaseAutopilotMerchDropResult,
} from './types';

const RELEASE_ID_PROMPT_PREFIX = 'release_id:';

export function buildReleaseMerchPrompt(input: {
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly artworkUrl: string | null;
  readonly releaseType: string;
}): string {
  const artworkLine = input.artworkUrl
    ? `Release artwork reference: ${input.artworkUrl}`
    : 'Release artwork is not attached yet. Use the release title as the visual anchor.';

  return [
    `${RELEASE_ID_PROMPT_PREFIX}${input.releaseId}`,
    `Create one premium release merch drop for "${input.releaseTitle}" (${input.releaseType}).`,
    artworkLine,
    'Product family: one black premium tee for Printful catalog product 71.',
    'Keep the design release-specific, premium, and free of fake tour dates or invented claims.',
  ].join('\n');
}

function releasePromptPrefix(releaseId: string): string {
  return `${RELEASE_ID_PROMPT_PREFIX}${releaseId}`;
}

async function findExistingReleaseMerchDrop(
  releaseId: string
): Promise<ReleaseAutopilotMerchDropResult | null> {
  const [batch] = await db
    .select({
      generationId: merchGenerationBatches.id,
      merchCardId: merchGenerationBatches.selectedMerchCardId,
    })
    .from(merchGenerationBatches)
    .where(
      and(
        eq(merchGenerationBatches.command, RELEASE_AUTOPILOT_MERCH_COMMAND),
        like(
          merchGenerationBatches.prompt,
          `${releasePromptPrefix(releaseId)}%`
        ),
        isNotNull(merchGenerationBatches.selectedMerchCardId)
      )
    )
    .limit(1);

  if (!batch?.merchCardId) {
    return null;
  }

  return {
    status: 'existing',
    merchCardId: batch.merchCardId,
    generationId: batch.generationId,
    approvalStatus: 'needs_review',
  };
}

async function brandMerchCardForRelease(input: {
  readonly merchCardId: string;
  readonly releaseTitle: string;
}): Promise<void> {
  const productLabel = MERCH_DEFAULT_PRINTFUL_PRODUCT.productType;
  await db
    .update(merchCards)
    .set({
      title: `${input.releaseTitle} Release ${productLabel}`,
      description: `Draft merch drop for ${input.releaseTitle}. Review before publishing.`,
      updatedAt: new Date(),
    })
    .where(eq(merchCards.id, input.merchCardId));
}

export async function generateReleaseMerchDrop(params: {
  readonly profileId: string;
  readonly releaseId: string;
  readonly clerkUserId: string;
}): Promise<ReleaseAutopilotMerchDropResult> {
  const existing = await findExistingReleaseMerchDrop(params.releaseId);
  if (existing) {
    return existing;
  }

  const [release] = await db
    .select({
      id: discogReleases.id,
      creatorProfileId: discogReleases.creatorProfileId,
      title: discogReleases.title,
      artworkUrl: discogReleases.artworkUrl,
      releaseType: discogReleases.releaseType,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, params.releaseId),
        eq(discogReleases.creatorProfileId, params.profileId)
      )
    )
    .limit(1);

  if (!release) {
    return {
      status: 'skipped',
      merchCardId: null,
      generationId: null,
      approvalStatus: null,
      skippedReason: 'Release not found for profile',
    };
  }

  const prompt = buildReleaseMerchPrompt({
    releaseId: release.id,
    releaseTitle: release.title,
    artworkUrl: release.artworkUrl,
    releaseType: release.releaseType,
  });

  const generation = await createMerchGeneration({
    profileId: params.profileId,
    clerkUserId: params.clerkUserId,
    prompt,
    command: RELEASE_AUTOPILOT_MERCH_COMMAND,
    conversationId: null,
    turnId: null,
  });

  const selection = await selectMerchDesign({
    generationId: generation.generationId,
    clerkUserId: params.clerkUserId,
    optionNumber: 1,
    publish: false,
  });

  await brandMerchCardForRelease({
    merchCardId: selection.merchCardId,
    releaseTitle: release.title,
  });

  await upsertLibraryApprovalStatus({
    creatorProfileId: params.profileId,
    assetId: `merch-${selection.merchCardId}`,
    itemKind: 'merch',
    approvalStatus: 'needs_review',
  });

  return {
    status: 'created',
    merchCardId: selection.merchCardId,
    generationId: generation.generationId,
    approvalStatus: 'needs_review',
  };
}
