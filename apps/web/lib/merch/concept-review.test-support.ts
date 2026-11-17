import {
  MERCH_CONCEPT_CONTRACT,
  MERCH_CONCEPT_CRITERIA,
  type MerchConceptReview,
} from './concept-contract';
import { type MerchConceptPlan, merchConceptHash } from './concept-review';

/** Synthetic trusted-store rows for tests only, never production approval. */
export function syntheticConceptReview(plan: MerchConceptPlan, now: Date) {
  const sourceDigest = merchConceptHash(plan.source);
  const planHash = merchConceptHash({
    contractVersion: MERCH_CONCEPT_CONTRACT,
    ...plan,
  });
  const validUntil = new Date(now.getTime() + 3600_000).toISOString();
  const details: MerchConceptReview = {
    phase: 'pre_art',
    contractVersion: MERCH_CONCEPT_CONTRACT,
    planHash,
    feedbackHash: merchConceptHash(plan.feedback),
    authority: {
      kind: 'human',
      actorId: 'synthetic-reviewer',
      approvalReceiptId: 'synthetic:approval',
    },
    artistConsentReceiptId: 'synthetic:consent',
    validUntil,
    sourceSnapshot: {
      sourceId: 'synthetic:source',
      receiptId: 'synthetic:snapshot',
      digest: sourceDigest,
      snapshotHash: merchConceptHash('synthetic snapshot bytes'),
      observedAt: now.toISOString(),
      rightsKinds: ['original_graphic'],
    },
    rights: [
      {
        sourceId: 'synthetic:source',
        sourceDigest,
        kind: 'original_graphic',
        use: 'concept_render',
        status: 'cleared',
        receiptId: 'synthetic:render-permission',
        validUntil,
      },
      {
        sourceId: 'synthetic:source',
        sourceDigest,
        kind: 'original_graphic',
        use: 'public_artifact_hosting',
        status: 'cleared',
        receiptId: 'synthetic:explicit-public-hosting',
        validUntil,
      },
    ],
    candidates: plan.candidates.map(candidate => ({
      key: candidate.key,
      verdict: 'approve',
      scores: Object.fromEntries(
        MERCH_CONCEPT_CRITERIA.map(key => [key, 4])
      ) as Record<(typeof MERCH_CONCEPT_CRITERIA)[number], number>,
      reasons: ['Synthetic human-labeled fixture; not actual quality proof.'],
    })),
    lockedLayerHashes: [],
    eventRecords: [],
  };
  return {
    id: 'synthetic-review',
    creatorProfileId: plan.profileId,
    inputHash: planHash,
    verdict: 'pass',
    disposition: 'cleared',
    reviewerVersion: 'synthetic-human/v1',
    reviewedAt: now,
    details,
  };
}
