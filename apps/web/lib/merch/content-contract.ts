/**
 * Versioned merch content contract (JOV-4740).
 *
 * Default product mode is graphic-only: merch may not contain humans, faces,
 * portraits, body parts, photoreal people, or person-like silhouettes.
 * A future explicit likeness mode can opt in; until that product exists the
 * hard rule stays on.
 *
 * Review evidence is persisted on `qualityReview` so generation, selection,
 * and publish all read the same stamp.
 */

export const MERCH_CONTENT_CONTRACT_VERSION = 'merch-content/v1';

export const MERCH_CONTENT_REVIEWER_VERSION = 'merch-person-reviewer/v1';

export const MERCH_CONTENT_MODE_GRAPHIC_ONLY = 'graphic_only';

export type MerchContentMode = typeof MERCH_CONTENT_MODE_GRAPHIC_ONLY;

export const MERCH_PERSON_CONTENT_FAILURE_CODES = [
  'person.human',
  'person.face',
  'person.portrait',
  'person.body_part',
  'person.photoreal',
  'person.silhouette',
  'person.implied',
] as const;

export type MerchPersonContentFailureCode =
  (typeof MERCH_PERSON_CONTENT_FAILURE_CODES)[number];

export type MerchContentReviewVerdict = 'pass' | 'reject';

export const MERCH_PERSON_CONTENT_PUBLISH_BLOCKER =
  'Generated person or person-like content is not allowed on merch graphics.';

export const MERCH_CONTENT_REVIEW_REQUIRED_BLOCKER =
  'Merch content review is missing; regenerate before publishing.';

export interface MerchContentReview {
  readonly contractVersion: typeof MERCH_CONTENT_CONTRACT_VERSION;
  readonly reviewerVersion: typeof MERCH_CONTENT_REVIEWER_VERSION;
  readonly mode: MerchContentMode;
  readonly verdict: MerchContentReviewVerdict;
  readonly failureCodes: readonly MerchPersonContentFailureCode[];
  readonly confidence: number;
  readonly reviewedAt: string;
}

export interface MerchContentSubject {
  readonly prompt?: string;
  readonly concept?: string;
  readonly labels?: readonly string[];
  readonly imageDescription?: string;
}

export function isMerchPersonContentFailureCode(
  value: unknown
): value is MerchPersonContentFailureCode {
  return (
    typeof value === 'string' &&
    (MERCH_PERSON_CONTENT_FAILURE_CODES as readonly string[]).includes(value)
  );
}

export class MerchPersonContentRejectedError extends Error {
  readonly review: MerchContentReview;

  constructor(review: MerchContentReview) {
    super(MERCH_PERSON_CONTENT_PUBLISH_BLOCKER);
    this.name = 'MerchPersonContentRejectedError';
    this.review = review;
  }
}

export function isCriticalPersonContent(
  review: Pick<MerchContentReview, 'verdict' | 'failureCodes'>
): boolean {
  return review.verdict === 'reject' && review.failureCodes.length > 0;
}

export function stampMerchContentReview(
  review: MerchContentReview
): Record<string, unknown> {
  return {
    contentContractVersion: review.contractVersion,
    contentReviewerVersion: review.reviewerVersion,
    contentReview: {
      contractVersion: review.contractVersion,
      reviewerVersion: review.reviewerVersion,
      mode: review.mode,
      verdict: review.verdict,
      failureCodes: [...review.failureCodes],
      confidence: review.confidence,
      reviewedAt: review.reviewedAt,
    },
  };
}

export function readMerchContentReview(
  qualityReview: Record<string, unknown> | null | undefined
): MerchContentReview | null {
  const raw = qualityReview?.contentReview;
  if (!raw || typeof raw !== 'object') return null;
  const review = raw as Record<string, unknown>;
  if (
    review.contractVersion !== MERCH_CONTENT_CONTRACT_VERSION ||
    review.reviewerVersion !== MERCH_CONTENT_REVIEWER_VERSION ||
    review.mode !== MERCH_CONTENT_MODE_GRAPHIC_ONLY ||
    (review.verdict !== 'pass' && review.verdict !== 'reject') ||
    typeof review.confidence !== 'number' ||
    typeof review.reviewedAt !== 'string' ||
    !Array.isArray(review.failureCodes) ||
    !review.failureCodes.every(isMerchPersonContentFailureCode)
  ) {
    return null;
  }

  return {
    contractVersion: MERCH_CONTENT_CONTRACT_VERSION,
    reviewerVersion: MERCH_CONTENT_REVIEWER_VERSION,
    mode: MERCH_CONTENT_MODE_GRAPHIC_ONLY,
    verdict: review.verdict,
    failureCodes: review.failureCodes,
    confidence: review.confidence,
    reviewedAt: review.reviewedAt,
  };
}

/**
 * Canonical-pipeline options (generation contract stamped) and any option
 * that already carries a content-contract stamp must have a passing review.
 * Pre-contract legacy options keep historical behavior.
 */
export function requiresMerchContentReview(
  qualityReview: Record<string, unknown> | null | undefined
): boolean {
  return (
    qualityReview?.contractVersion === 'merch-generation/v1' ||
    qualityReview?.contentContractVersion === MERCH_CONTENT_CONTRACT_VERSION ||
    qualityReview?.contentReview != null
  );
}

export function getMerchContentReviewBlockers(
  qualityReview: Record<string, unknown> | null | undefined
): string[] {
  if (!requiresMerchContentReview(qualityReview)) return [];
  const review = readMerchContentReview(qualityReview);
  if (!review) return [MERCH_CONTENT_REVIEW_REQUIRED_BLOCKER];
  if (isCriticalPersonContent(review)) {
    return [MERCH_PERSON_CONTENT_PUBLISH_BLOCKER];
  }
  return [];
}
