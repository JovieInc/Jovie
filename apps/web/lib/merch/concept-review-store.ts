import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  merchCandidateQaReviews,
  merchDesignOptions,
} from '@/lib/db/schema/merch';
import { MERCH_CONCEPT_CONTRACT } from './concept-contract';
import {
  evaluateMerchConceptPlan,
  type MerchConceptPlan,
  merchConceptHash,
} from './concept-review';

export async function getMerchConceptFeedback(profileId: string) {
  return db
    .select({
      id: merchDesignOptions.id,
      concept: merchDesignOptions.concept,
      learning: merchDesignOptions.learning,
      updatedAt: merchDesignOptions.updatedAt,
    })
    .from(merchDesignOptions)
    .where(
      and(
        eq(merchDesignOptions.creatorProfileId, profileId),
        eq(merchDesignOptions.status, 'rejected')
      )
    )
    .orderBy(desc(merchDesignOptions.updatedAt), desc(merchDesignOptions.id))
    .limit(20);
}

/** Reviews come from the existing immutable store, never a model's tool arguments. */
export async function reviewStoredMerchConceptPlan(
  plan: MerchConceptPlan,
  now: Date
) {
  const planHash = merchConceptHash({
    contractVersion: MERCH_CONCEPT_CONTRACT,
    ...plan,
  });
  const [row] = await db
    .select({ review: merchCandidateQaReviews })
    .from(merchCandidateQaReviews)
    .innerJoin(
      merchDesignOptions,
      and(
        eq(merchDesignOptions.id, merchCandidateQaReviews.designOptionId),
        eq(
          merchDesignOptions.creatorProfileId,
          merchCandidateQaReviews.creatorProfileId
        )
      )
    )
    .where(
      and(
        eq(merchCandidateQaReviews.creatorProfileId, plan.profileId),
        eq(merchCandidateQaReviews.inputHash, planHash)
      )
    )
    .orderBy(
      desc(merchCandidateQaReviews.createdAt),
      desc(merchCandidateQaReviews.id)
    )
    .limit(1);
  return evaluateMerchConceptPlan(plan, row?.review ?? null, now);
}
