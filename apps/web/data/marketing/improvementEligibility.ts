import {
  type MarketingCandidateEligibility,
  type MarketingCandidateEvaluation,
  type MarketingProtectedCheck,
  type MarketingRepairInstruction,
  resolveMarketingEligibility,
} from './decision';
import type {
  MarketingSemanticReviewLike,
  MarketingSemanticReviewStatus,
} from './improvementRecords';

function semanticDimension(checkId: string): string {
  const normalized = checkId.trim().toLowerCase();
  return (
    {
      'claim-support': 'claim-support',
      'section-overlap': 'new-information',
      'cta-expectation': 'cta-expectation',
      audience: 'audience-fit',
      narrative: 'section-job',
      section: 'section-job',
    }[normalized] ?? normalized
  );
}

function semanticVerdict(
  status: MarketingSemanticReviewStatus
): 'pass' | 'fail' | 'uncertain' {
  if (status === 'supported') return 'pass';
  if (status === 'contradicted') return 'fail';
  return 'uncertain';
}

export function eligibilityFromMarketingSemanticReviews(input: {
  readonly candidateId: string;
  readonly reviews: readonly MarketingSemanticReviewLike[];
  readonly requiredDimensions?: readonly string[];
}): MarketingCandidateEligibility {
  const checks: MarketingProtectedCheck[] = input.reviews.map(review => ({
    dimension: semanticDimension(review.checkId),
    verdict: semanticVerdict(review.status),
    evidenceRefs: review.evidenceRefs,
    finding: review.findings.join(' '),
  }));
  const eligibility = resolveMarketingEligibility({
    checks,
    requiredDimensions: input.requiredDimensions,
    candidateId: input.candidateId,
  });
  if (input.reviews.length === 0) {
    return {
      ...eligibility,
      status: 'uncertain',
      stopReason: 'missing-evidence',
    };
  }
  const authorityViolation = input.reviews.some(
    review => review.advisory !== true || review.certified !== false
  );
  if (authorityViolation) {
    return {
      ...eligibility,
      status: 'uncertain',
      stopReason: 'requires-human-judgment',
      findings: [
        ...eligibility.findings,
        {
          code: 'protected-check-uncertain',
          candidateId: input.candidateId,
          message: 'Semantic review must remain advisory and uncertified.',
        },
      ],
    };
  }
  const unavailable = input.reviews.some(
    review => review.status === 'unavailable'
  );
  const specialist = input.reviews.some(
    review => review.status === 'needs-specialist'
  );
  return {
    ...eligibility,
    stopReason: unavailable
      ? 'reviewer-unavailable'
      : specialist
        ? 'requires-human-judgment'
        : eligibility.stopReason,
  };
}

export function inferMarketingRepair<TValue>(
  evaluation: MarketingCandidateEvaluation<TValue>
): MarketingRepairInstruction | undefined {
  if (evaluation.eligibility.repair) return evaluation.eligibility.repair;
  const failingDimensions = evaluation.eligibility.checks
    .filter(check => check.verdict !== 'pass')
    .map(check => check.dimension);
  if (failingDimensions.length === 0) return undefined;
  const target: MarketingRepairInstruction['target'] = failingDimensions.some(
    dimension => dimension === 'claim-support'
  )
    ? 'truth'
    : failingDimensions.some(dimension => dimension === 'new-information')
      ? 'narrative'
      : failingDimensions.some(dimension => dimension === 'cta-expectation')
        ? 'copy'
        : 'semantic';
  return {
    target,
    reason: evaluation.eligibility.findings
      .map(finding => finding.message)
      .join(' '),
    findingCodes: evaluation.eligibility.findings.map(finding => finding.code),
    paths: evaluation.candidate.changedPaths,
  };
}

export function marketingRepairFailureKey(
  repairs: readonly MarketingRepairInstruction[]
): string {
  return repairs
    .map(repair =>
      [repair.target, ...repair.findingCodes, ...repair.paths].join('|')
    )
    .sort()
    .join('||');
}
