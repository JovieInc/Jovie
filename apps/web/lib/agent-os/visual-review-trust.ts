/**
 * Dependency-free visual-review provenance checks shared by generation and
 * certification. This module intentionally has no model client or registry.
 */

export type VisualReviewTrustFailure =
  | 'missing_generator_model_id'
  | 'missing_reviewer_model_id'
  | 'self_reviewed_visual'
  | 'missing_review_execution_id'
  | 'missing_expected_candidate_digest'
  | 'missing_review_candidate_digest'
  | 'visual_review_candidate_digest_mismatch'
  | 'visual_review_not_passed';

export interface VisualReviewTrustInput {
  readonly expectedCandidateDigest: string | null | undefined;
  readonly generatorModelId: string | null | undefined;
  readonly receipt: {
    readonly status?: string;
    readonly verdict?: string;
    readonly reviewerModelId?: string;
    readonly executionId?: string;
    readonly candidateDigest?: string;
  };
}

export interface VisualReviewTrustResult {
  readonly trusted: boolean;
  readonly failures: readonly VisualReviewTrustFailure[];
}

/**
 * A visual pass is useful only when the exact candidate and an independent
 * reviewer execution are named. The caller remains responsible for obtaining
 * the receipt from its trusted producer; this helper only checks the typed
 * evidence that crossed the boundary.
 */
export function evaluateIndependentVisualReviewTrust(
  input: VisualReviewTrustInput
): VisualReviewTrustResult {
  const failures: VisualReviewTrustFailure[] = [];
  const generatorModelId = input.generatorModelId?.trim() ?? '';
  const reviewerModelId = input.receipt.reviewerModelId?.trim() ?? '';
  const executionId = input.receipt.executionId?.trim() ?? '';
  const expectedCandidateDigest = input.expectedCandidateDigest?.trim() ?? '';
  const candidateDigest = input.receipt.candidateDigest?.trim() ?? '';

  if (!generatorModelId) failures.push('missing_generator_model_id');
  if (!reviewerModelId) failures.push('missing_reviewer_model_id');
  if (generatorModelId && reviewerModelId === generatorModelId) {
    failures.push('self_reviewed_visual');
  }
  if (!executionId) failures.push('missing_review_execution_id');
  if (!expectedCandidateDigest) {
    failures.push('missing_expected_candidate_digest');
  }
  if (!candidateDigest) {
    failures.push('missing_review_candidate_digest');
  } else if (
    expectedCandidateDigest &&
    candidateDigest !== expectedCandidateDigest
  ) {
    failures.push('visual_review_candidate_digest_mismatch');
  }

  const hasPassSignal =
    input.receipt.verdict !== undefined || input.receipt.status !== undefined;
  if (
    !hasPassSignal ||
    (input.receipt.verdict !== undefined && input.receipt.verdict !== 'pass') ||
    (input.receipt.status !== undefined && input.receipt.status !== 'passed')
  ) {
    failures.push('visual_review_not_passed');
  }

  return { failures, trusted: failures.length === 0 };
}
