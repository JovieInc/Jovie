import { evidenceFingerprint } from '../../invariants/run-outcome.mjs';
import { MANAGEMENT_CASE_SCHEMA } from '../management-judgment.mjs';

const DEFAULT_BUDGET = Object.freeze({
  maxFounderCorrectionMinutes: 30,
  maxLatencyMs: 30_000,
  maxUsd: 0.25,
});

export function managementCase({
  id,
  split,
  kind = 'real',
  frozenAt,
  issue,
  revision,
  path,
  sourceContent,
  sourceDigest,
  privateJoinRef,
  tags,
  workloadClass,
  alternatives,
  historicalAlternativeId = null,
  outcomeStatus,
  protectedCase = false,
  requiresConsequentialApproval = false,
  adversarialPairKey = null,
}) {
  const sourceRef = `git:${revision}:${path}`;
  const source = {
    ref: sourceRef,
    revision,
    capturedAt: frozenAt,
    digest: sourceDigest ?? evidenceFingerprint(sourceContent),
    content: sourceContent ?? null,
    ...(privateJoinRef ? { privateJoinRef } : {}),
  };
  return Object.freeze({
    schema: MANAGEMENT_CASE_SCHEMA,
    id,
    issue,
    kind,
    split,
    protected: protectedCase,
    tuningAccessCount: 0,
    frozenAt,
    strategyRef: 'linear:JOV-6471/effective-at-freeze',
    workloadClass,
    adversarialPairKey,
    tags: Object.freeze(tags),
    sources: Object.freeze([Object.freeze(source)]),
    evidence: Object.freeze([
      Object.freeze({
        id: 'decision-time-source',
        sourceRef,
        observedAt: frozenAt,
        stance: 'context',
        summary:
          sourceContent === null
            ? 'withheld from development access; resolve through the private immutable join'
            : sourceContent,
      }),
    ]),
    alternatives: Object.freeze(
      alternatives.map(([alternativeId, summary, reversible, authority]) =>
        Object.freeze({
          id: alternativeId,
          summary,
          reversible,
          authority,
          supportedBy: Object.freeze(['decision-time-source']),
        })
      )
    ),
    constraints: Object.freeze({
      requiresConsequentialApproval,
      customerIsolation: true,
      noNewCommercialExperiment: true,
      parentBetCap: 1,
    }),
    historical: Object.freeze({
      alternativeId: historicalAlternativeId,
      isGroundTruth: false,
    }),
    outcome: Object.freeze({ status: outcomeStatus, observedAt: null }),
    budget: DEFAULT_BUDGET,
    humanAdjudication: null,
  });
}
