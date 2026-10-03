import type {
  MarketingCandidateEvaluation,
  MarketingFrozenDecisionContext,
} from './decision';
import {
  MARKETING_COMMERCIAL_OUTCOME_SCHEMA,
  MARKETING_SEMANTIC_OUTCOME_SCHEMA,
  MARKETING_TASTE_OUTCOME_SCHEMA,
  type MarketingCommercialOutcomeLink,
  type MarketingCommercialOutcomeRecord,
  type MarketingSemanticOutcomeRecord,
  type MarketingSemanticReviewLike,
  type MarketingTasteOutcomeRecord,
} from './improvementRecords';

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasTextArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'string' && item.trim().length > 0)
  );
}

function outcomeBindingMatches(input: {
  readonly outcome: {
    readonly schema?: unknown;
    readonly decisionId?: unknown;
    readonly contextDigest?: unknown;
    readonly candidateDigest?: unknown;
    readonly certified?: unknown;
  };
  readonly schema: string;
  readonly context: MarketingFrozenDecisionContext;
  readonly candidateDigest: string;
}): boolean {
  return (
    input.outcome.schema === input.schema &&
    input.outcome.decisionId === input.context.decisionId &&
    input.outcome.contextDigest === input.context.contextDigest &&
    input.outcome.candidateDigest === input.candidateDigest &&
    input.outcome.certified === false
  );
}

export function defaultMarketingTasteOutcome(input: {
  readonly context: MarketingFrozenDecisionContext;
  readonly candidateDigest: string;
}): MarketingTasteOutcomeRecord {
  return {
    schema: MARKETING_TASTE_OUTCOME_SCHEMA,
    decisionId: input.context.decisionId,
    contextDigest: input.context.contextDigest,
    candidateDigest: input.candidateDigest,
    status: 'pending',
    evidenceRefs: [],
    reviewer: null,
    notes: 'Founder Taste admission remains a separate decision.',
    certified: false,
  };
}

export function defaultMarketingCommercialOutcome(input: {
  readonly context: MarketingFrozenDecisionContext;
  readonly candidateDigest: string;
  readonly link: MarketingCommercialOutcomeLink | null;
}): MarketingCommercialOutcomeRecord {
  const link = input.link
    ? (Object.fromEntries(
        Object.entries(input.link).filter(([, value]) => value !== undefined)
      ) as MarketingCommercialOutcomeLink)
    : null;
  return {
    schema: MARKETING_COMMERCIAL_OUTCOME_SCHEMA,
    decisionId: input.context.decisionId,
    contextDigest: input.context.contextDigest,
    candidateDigest: input.candidateDigest,
    status: 'unknown',
    link,
    evidenceRefs: [],
    metrics: null,
    certified: false,
  };
}

export function normalizeMarketingTasteOutcome(input: {
  readonly outcome: MarketingTasteOutcomeRecord;
  readonly context: MarketingFrozenDecisionContext;
  readonly candidateDigest: string;
  readonly fallback: MarketingTasteOutcomeRecord;
}): MarketingTasteOutcomeRecord {
  const outcome = input.outcome as unknown as Record<string, unknown>;
  const status = outcome.status;
  const evidenceRefs = outcome.evidenceRefs;
  if (
    !outcomeBindingMatches({
      outcome,
      schema: MARKETING_TASTE_OUTCOME_SCHEMA,
      context: input.context,
      candidateDigest: input.candidateDigest,
    }) ||
    !['pending', 'approved', 'rejected', 'unknown'].includes(String(status)) ||
    !hasTextArray(evidenceRefs) ||
    (['approved', 'rejected'].includes(String(status)) &&
      evidenceRefs.length === 0)
  ) {
    return input.fallback;
  }
  return input.outcome;
}

export function normalizeMarketingCommercialOutcome(input: {
  readonly outcome: MarketingCommercialOutcomeRecord;
  readonly context: MarketingFrozenDecisionContext;
  readonly candidateDigest: string;
  readonly fallback: MarketingCommercialOutcomeRecord;
}): MarketingCommercialOutcomeRecord {
  const outcome = input.outcome as unknown as Record<string, unknown>;
  const status = outcome.status;
  const evidenceRefs = outcome.evidenceRefs;
  const link = outcome.link;
  const metrics = outcome.metrics;
  const validMetrics =
    metrics === null ||
    (typeof metrics === 'object' &&
      metrics !== null &&
      !Array.isArray(metrics) &&
      Object.values(metrics).every(
        metric => typeof metric === 'number' && Number.isFinite(metric)
      ));
  const validLink =
    link === null ||
    (typeof link === 'object' &&
      link !== null &&
      (link as { source?: unknown }).source === 'existing-outcome-loop' &&
      hasText((link as { variantId?: unknown }).variantId));
  const evidenceBound = hasTextArray(evidenceRefs);
  const needsExternalEvidence = status !== 'unknown';
  if (
    !outcomeBindingMatches({
      outcome,
      schema: MARKETING_COMMERCIAL_OUTCOME_SCHEMA,
      context: input.context,
      candidateDigest: input.candidateDigest,
    }) ||
    !['measuring', 'observed-positive', 'observed-zero', 'unknown'].includes(
      String(status)
    ) ||
    !validLink ||
    !validMetrics ||
    !evidenceBound ||
    (needsExternalEvidence && (link === null || evidenceRefs.length === 0))
  ) {
    return input.fallback;
  }
  return input.outcome;
}

/** Build direct protected-review records when no semantic adapter was used. */
export function directMarketingSemanticOutcomeRecords<TValue>(input: {
  readonly decisionId: string;
  readonly contextDigest: string;
  readonly evaluations: readonly MarketingCandidateEvaluation<TValue>[];
}): readonly MarketingSemanticOutcomeRecord[] {
  return input.evaluations.flatMap(evaluation => {
    const status =
      evaluation.eligibility.status === 'eligible'
        ? 'supported'
        : evaluation.eligibility.status === 'ineligible'
          ? 'contradicted'
          : 'insufficient';
    return [
      {
        schema: MARKETING_SEMANTIC_OUTCOME_SCHEMA,
        decisionId: input.decisionId,
        contextDigest: input.contextDigest,
        candidateId: evaluation.candidate.id,
        candidateDigest: evaluation.candidate.digest,
        checkId: 'protected-eligibility',
        status,
        findings: evaluation.eligibility.findings.map(
          finding => finding.message
        ),
        evidenceRefs: evaluation.eligibility.checks.flatMap(
          check => check.evidenceRefs
        ),
        fingerprint: null,
        advisory: true as const,
        certified: false as const,
      },
    ];
  });
}

/** Bind every semantic review to the candidate that actually produced it. */
export function marketingSemanticOutcomeRecordsForCandidate(input: {
  readonly decisionId: string;
  readonly contextDigest: string;
  readonly candidate: { readonly id: string; readonly digest: string };
  readonly reviews: readonly MarketingSemanticReviewLike[];
}): readonly MarketingSemanticOutcomeRecord[] {
  return input.reviews.map(review => ({
    schema: MARKETING_SEMANTIC_OUTCOME_SCHEMA,
    decisionId: input.decisionId,
    contextDigest: input.contextDigest,
    candidateId: input.candidate.id,
    candidateDigest: input.candidate.digest,
    checkId: review.checkId,
    status: review.status,
    findings: review.findings,
    evidenceRefs: review.evidenceRefs,
    fingerprint: review.fingerprint,
    advisory: true,
    certified: false,
  }));
}
