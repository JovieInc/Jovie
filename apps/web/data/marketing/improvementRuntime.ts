import type {
  MarketingCandidateEligibility,
  MarketingPreferenceDecision,
} from './decision';
import type { MarketingSemanticReviewLike } from './improvementRecords';

const SEMANTIC_STATUSES = new Set([
  'supported',
  'contradicted',
  'insufficient',
  'needs-specialist',
  'unavailable',
]);

export function isMarketingCandidateEligibility(
  value: unknown
): value is MarketingCandidateEligibility {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    ['eligible', 'ineligible', 'uncertain'].includes(
      String(candidate.status)
    ) &&
    Array.isArray(candidate.checks) &&
    candidate.checks.every(
      check => typeof check === 'object' && check !== null
    ) &&
    Array.isArray(candidate.findings)
  );
}

export function isMarketingSemanticReviewLike(
  value: unknown
): value is MarketingSemanticReviewLike {
  if (typeof value !== 'object' || value === null) return false;
  const review = value as Record<string, unknown>;
  return (
    typeof review.checkId === 'string' &&
    review.checkId.trim().length > 0 &&
    SEMANTIC_STATUSES.has(String(review.status)) &&
    Array.isArray(review.findings) &&
    review.findings.every(finding => typeof finding === 'string') &&
    Array.isArray(review.evidenceRefs) &&
    review.evidenceRefs.every(evidenceRef => typeof evidenceRef === 'string') &&
    typeof review.fingerprint === 'string' &&
    review.advisory === true &&
    review.certified === false
  );
}

export function isMarketingPreferenceDecision(
  value: unknown
): value is MarketingPreferenceDecision {
  if (typeof value !== 'object' || value === null) return false;
  const preference = value as Record<string, unknown>;
  const status = String(preference.status);
  return (
    typeof preference.contextDigest === 'string' &&
    typeof preference.incumbentDigest === 'string' &&
    ['candidate', 'incumbent', 'tie', 'uncertain', 'unavailable'].includes(
      status
    ) &&
    Array.isArray(preference.comparedCandidateIds) &&
    preference.comparedCandidateIds.every(id => typeof id === 'string') &&
    typeof preference.reason === 'string' &&
    (status !== 'candidate' || typeof preference.candidateId === 'string')
  );
}
