import 'server-only';

import { db } from '@/lib/db';
import {
  type MerchArtistBrief,
  merchGenerationBatches,
} from '@/lib/db/schema/merch';
import { getMerchConceptPublicationBlockers } from './concept-contract';
import type { MerchConceptPlan } from './concept-review';
import { reviewStoredMerchConceptPlan } from './concept-review-store';

/** Persist exact pre-art evidence before the generator can cross an image boundary. */
export async function persistMerchConceptPlan(input: {
  readonly generationId: string;
  readonly plan: MerchConceptPlan;
  readonly artistBrief: MerchArtistBrief;
  readonly enteredAt: Date;
  readonly params: {
    readonly profileId: string;
    readonly clerkUserId: string;
    readonly prompt: string;
    readonly conversationId?: string | null;
    readonly turnId?: string | null;
  };
}) {
  const review = await reviewStoredMerchConceptPlan(input.plan, new Date());
  const evaluatedAt = new Date().toISOString();
  const receipt = {
    ...review,
    publicationBlockers: getMerchConceptPublicationBlockers({
      conceptReview: review,
    }),
    stageEvent: {
      schema: 'jovie-stage-event/v1',
      entityType: 'merch-concept',
      entityId: input.generationId,
      stage: 'pre-art-review',
      enteredAt: input.enteredAt.toISOString(),
      exitedAt: evaluatedAt,
      actor: 'canonical-merch-generator',
      outcome: review.decision === 'eligible' ? 'advanced' : 'failed',
      sourceReceipt: `merch-batch:${input.generationId}:artistBrief.conceptReview`,
    },
    completionStageEvent: {
      schema: 'jovie-stage-event/v1',
      entityType: 'merch-concept',
      entityId: input.generationId,
      stage: 'reviewed',
      enteredAt: evaluatedAt,
      exitedAt: null,
      actor: 'canonical-merch-generator',
      outcome: review.decision === 'eligible' ? 'completed' : 'failed',
      sourceReceipt: `merch-batch:${input.generationId}:artistBrief.conceptReview`,
    },
  };
  await db.insert(merchGenerationBatches).values({
    id: input.generationId,
    creatorProfileId: input.params.profileId,
    createdByClerkUserId: input.params.clerkUserId,
    chatConversationId: input.params.conversationId ?? null,
    chatTurnId: input.params.turnId ?? null,
    prompt: input.params.prompt,
    command: 'generate_merch_designs',
    artistBrief: {
      ...input.artistBrief,
      conceptPlan: input.plan,
      conceptReview: receipt,
    },
    status: review.decision === 'eligible' ? 'generating' : 'failed',
    ...(review.decision === 'eligible'
      ? {}
      : { error: 'concept_review_required', completedAt: new Date() }),
  });
  return receipt;
}
