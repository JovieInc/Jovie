import { createHash } from 'node:crypto';
import {
  MERCH_CONCEPT_CONTRACT,
  MERCH_CONCEPT_CRITERIA,
  merchConceptReviewSchema,
} from './concept-contract';
import type { MerchDesignStrategy } from './design-strategies';
import type { MerchSource } from './source-candidates';

export interface MerchConceptPlan {
  readonly profileId: string;
  readonly artistName: string;
  readonly prompt: string;
  readonly source: MerchSource;
  readonly feedback: readonly unknown[];
  readonly product: {
    readonly catalogProductId: number;
    readonly catalogVariantIds: readonly number[];
    readonly placements: readonly string[];
    readonly technique: string;
    readonly colorway: string;
  };
  readonly candidates: readonly {
    readonly key: string;
    readonly prompt: string;
    readonly strategy: MerchDesignStrategy;
  }[];
}

export interface StoredMerchConceptReview {
  readonly id: string;
  readonly creatorProfileId: string;
  readonly inputHash: string;
  readonly verdict: string;
  readonly disposition: string;
  readonly reviewerVersion: string;
  readonly reviewedAt: Date;
  readonly details: unknown;
}

/** Explicit operator configuration; empty by default. No model is silently called. */
export interface MerchConceptEvaluatorAdapter {
  readonly id: string;
  readonly benchmarkReceiptHash: string;
}

export function resolveMerchConceptCount(
  count: number | undefined,
  fallback: number
): number {
  const resolved = count ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 4) {
    throw new RangeError(
      'Merch concept count must be an integer between 1 and 4.'
    );
  }
  return resolved;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)])
    );
  }
  return value;
}

export function merchConceptHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

export function evaluateMerchConceptPlan(
  plan: MerchConceptPlan,
  stored: StoredMerchConceptReview | null,
  now: Date,
  adapters: readonly MerchConceptEvaluatorAdapter[] = []
) {
  const planHash = merchConceptHash({
    contractVersion: MERCH_CONCEPT_CONTRACT,
    ...plan,
  });
  const feedbackHash = merchConceptHash(plan.feedback);
  const reasons: string[] = [];
  const keys = plan.candidates.map(candidate => candidate.key);
  if (
    !plan.profileId.trim() ||
    !plan.artistName.trim() ||
    !plan.source.sourceText.trim() ||
    !plan.source.provenanceTitle.trim()
  )
    reasons.push('concept.source_required');
  if (
    !keys.length ||
    new Set(keys).size !== keys.length ||
    new Set(plan.candidates.map(candidate => candidate.prompt)).size !==
      keys.length
  )
    reasons.push('concept.invalid_candidates');
  const parsed = merchConceptReviewSchema.safeParse(stored?.details);
  if (!stored || !parsed.success) reasons.push('concept.review_required');
  const review = parsed.success ? parsed.data : null;
  if (stored && review) {
    if (stored.creatorProfileId !== plan.profileId)
      reasons.push('concept.wrong_artist');
    if (
      stored.inputHash !== planHash ||
      review.planHash !== planHash ||
      review.feedbackHash !== feedbackHash
    )
      reasons.push('concept.stale_review');
    if (
      !stored.reviewerVersion.trim() ||
      stored.verdict !== 'pass' ||
      stored.disposition !== 'cleared'
    )
      reasons.push('concept.not_approved');
    if (
      !Number.isFinite(stored.reviewedAt.getTime()) ||
      stored.reviewedAt > now ||
      Date.parse(review.validUntil) <= now.getTime()
    )
      reasons.push('concept.expired_review');
    const authority = review.authority;
    if (
      authority.kind === 'calibrated_evaluator' &&
      !adapters.some(
        adapter =>
          adapter.id === authority.adapterId &&
          adapter.benchmarkReceiptHash === authority.benchmarkReceiptHash
      )
    )
      reasons.push('concept.unverified_evaluator');
    if (
      review.sourceSnapshot.digest !== merchConceptHash(plan.source) ||
      Date.parse(review.sourceSnapshot.observedAt) > stored.reviewedAt.getTime()
    )
      reasons.push('concept.stale_source');
    for (const kind of review.sourceSnapshot.rightsKinds) {
      for (const use of [
        'concept_render',
        'public_artifact_hosting',
      ] as const) {
        const matching = review.rights.filter(
          right =>
            right.sourceId === review.sourceSnapshot.sourceId &&
            right.sourceDigest === review.sourceSnapshot.digest &&
            right.kind === kind &&
            right.use === use
        );
        // An overlapping dispute/unknown grant cannot be outweighed by another clearance.
        if (
          !matching.length ||
          matching.some(
            right =>
              right.status !== 'cleared' ||
              Date.parse(right.validUntil) <= now.getTime()
          )
        ) {
          reasons.push(`rights.not_cleared:${use}:${kind}`);
        }
      }
    }
    // The current renderer cannot preserve exact layers. Never ask it to redraw them.
    if (review.lockedLayerHashes.length)
      reasons.push('concept.locked_layer_renderer_required');
    const reviewedKeys = review.candidates.map(candidate => candidate.key);
    if (
      reviewedKeys.length !== keys.length ||
      new Set(reviewedKeys).size !== keys.length ||
      keys.some(key => !reviewedKeys.includes(key))
    )
      reasons.push('concept.incomplete_review');
    for (const candidate of review.candidates) {
      if (
        candidate.verdict !== 'approve' ||
        MERCH_CONCEPT_CRITERIA.some(key => candidate.scores[key] < 3)
      )
        reasons.push(`concept.ineligible:${candidate.key}`);
    }
    const dates =
      `${plan.prompt} ${plan.candidates.map(candidate => candidate.prompt).join(' ')}`.match(
        /\b(?:19|20)\d{2}(?:-\d{2}-\d{2})?\b/g
      ) ?? [];
    if (
      /\b(tour|festival|gig)\b/i.test(plan.prompt) &&
      !review.eventRecords.length
    )
      reasons.push('concept.unsourced_date');
    if (
      dates.some(
        date => !review.eventRecords.some(event => event.date.startsWith(date))
      )
    )
      reasons.push('concept.unsourced_date');
  }
  const rankedKeys = review
    ? [...review.candidates]
        .sort((a, b) =>
          MERCH_CONCEPT_CRITERIA.reduce(
            (sum, key) => sum + b.scores[key] - a.scores[key],
            0
          )
        )
        .map(candidate => candidate.key)
    : keys;
  return {
    contractVersion: MERCH_CONCEPT_CONTRACT,
    phase: 'pre_art' as const,
    decision: reasons.length
      ? ('review_required' as const)
      : ('eligible' as const),
    planHash,
    feedbackHash,
    reviewId: stored?.id ?? null,
    reviewedAt: now.toISOString(),
    reasons: [...new Set(reasons)],
    rankedKeys,
    candidates: review?.candidates ?? [],
    sourceSnapshot: review?.sourceSnapshot ?? null,
    rights: review?.rights ?? [],
    artistConsentReceiptId: review?.artistConsentReceiptId ?? null,
    artworkHash: null,
    imageCallsExecuted: 0,
  };
}
