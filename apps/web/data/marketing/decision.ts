import {
  cloneMarketingDecisionValue,
  freezeMarketingDecisionValue,
  marketingDecisionCandidateDigest,
  marketingDecisionContextDigest,
  marketingDecisionIncumbentDigest,
} from './decisionEvidence';
import type { MarketingGenerationStage } from './generation';

export {
  cloneMarketingDecisionValue,
  freezeMarketingDecisionValue,
  marketingDecisionCandidateDigest,
  marketingDecisionContextDigest,
  marketingDecisionDigest,
  marketingDecisionIncumbentDigest,
} from './decisionEvidence';

export const MARKETING_DECISION_SCHEMA_VERSION =
  'marketing-page-decision/v1' as const;

export const MARKETING_PROTECTED_DIMENSIONS = [
  'claim-support',
  'audience-fit',
  'section-job',
  'new-information',
  'cta-expectation',
] as const;

export type MarketingProtectedDimension =
  (typeof MARKETING_PROTECTED_DIMENSIONS)[number];

export type MarketingProtectedVerdict = 'pass' | 'fail' | 'uncertain';

export type MarketingEligibilityStatus =
  | 'eligible'
  | 'ineligible'
  | 'uncertain';

export type MarketingDecisionStopReason =
  | 'accepted-improvement'
  | 'incumbent-retained-preference'
  | 'incumbent-retained-tie'
  | 'incumbent-retained-uncertainty'
  | 'no-eligible-candidate'
  | 'preference-unavailable'
  | 'candidate-limit'
  | 'mutation-out-of-scope'
  | 'missing-evidence'
  | 'reviewer-unavailable'
  | 'repeated-failure'
  | 'stage-budget-exhausted'
  | 'total-budget-exhausted'
  | 'no-candidates'
  | 'requires-human-judgment';

export type MarketingRepairTarget =
  | 'truth'
  | 'narrative'
  | 'copy'
  | 'section-design'
  | 'implementation'
  | 'taste'
  | 'semantic'
  | 'human';

export interface MarketingDecisionContextInput {
  readonly decisionId: string;
  readonly pageId: string;
  readonly audience: string;
  readonly offer: string;
  readonly conversionObjective: string;
  readonly claimRevision: string;
  readonly recipeRevision: string;
  readonly rubricRevision: string;
  readonly sourceRevision: string;
  readonly contextDigest: string;
  readonly allowedMutationScope: readonly string[];
  readonly dependencyGraph?: Readonly<Record<string, readonly string[]>>;
}

export interface MarketingFrozenDecisionContext
  extends Omit<MarketingDecisionContextInput, 'dependencyGraph'> {
  readonly dependencyGraph: Readonly<Record<string, readonly string[]>>;
}

export interface MarketingDecisionIncumbent<TValue = unknown> {
  readonly id: string;
  readonly digest: string;
  readonly sourceRevision: string;
  readonly value: TValue;
  readonly dependencyIds: readonly string[];
}

export interface MarketingDecisionCandidate<TValue = unknown> {
  readonly id: string;
  readonly digest: string;
  readonly value: TValue;
  readonly changedPaths: readonly string[];
  readonly dependencyIds: readonly string[];
}

export interface MarketingDecisionFinding {
  readonly code:
    | 'candidate-count-out-of-range'
    | 'duplicate-candidate-id'
    | 'candidate-no-change'
    | 'duplicate-mutation-path'
    | 'mutation-out-of-scope'
    | 'missing-protected-check'
    | 'protected-check-failed'
    | 'protected-check-uncertain'
    | 'preference-candidate-not-eligible';
  readonly candidateId?: string;
  readonly dimension?: string;
  readonly message: string;
}

export interface MarketingRepairInstruction {
  readonly target: MarketingRepairTarget;
  readonly reason: string;
  readonly findingCodes: readonly string[];
  readonly paths: readonly string[];
}

export interface MarketingProtectedCheck {
  readonly dimension: string;
  readonly verdict: MarketingProtectedVerdict;
  readonly evidenceRefs: readonly string[];
  readonly finding?: string;
}

export interface MarketingCandidateEligibility {
  readonly status: MarketingEligibilityStatus;
  readonly checks: readonly MarketingProtectedCheck[];
  readonly requiredDimensions?: readonly string[];
  readonly findings: readonly MarketingDecisionFinding[];
  readonly repair?: MarketingRepairInstruction;
  readonly stopReason?: Extract<
    MarketingDecisionStopReason,
    'missing-evidence' | 'reviewer-unavailable' | 'requires-human-judgment'
  >;
}

export interface MarketingCandidateEvaluation<TValue = unknown> {
  readonly candidate: MarketingDecisionCandidate<TValue>;
  readonly eligibility: MarketingCandidateEligibility;
}

export type MarketingPreferenceStatus =
  | 'candidate'
  | 'incumbent'
  | 'tie'
  | 'uncertain'
  | 'unavailable';

export interface MarketingPreferenceDecision {
  readonly contextDigest: string;
  readonly incumbentDigest: string;
  readonly status: MarketingPreferenceStatus;
  readonly candidateId?: string;
  readonly comparedCandidateIds: readonly string[];
  readonly reason: string;
}

export interface MarketingDecisionSelection<TValue = unknown> {
  readonly schema: typeof MARKETING_DECISION_SCHEMA_VERSION;
  readonly stage: MarketingGenerationStage;
  readonly incumbent: MarketingDecisionIncumbent<TValue>;
  readonly selectedCandidate: MarketingDecisionCandidate<TValue> | null;
  readonly status: 'accepted' | 'incumbent-retained' | 'unresolved';
  readonly stopReason: MarketingDecisionStopReason;
  readonly evaluations: readonly MarketingCandidateEvaluation<TValue>[];
  readonly eligibleCandidateIds: readonly string[];
  readonly invalidatedDependencyIds: readonly string[];
  readonly certified: false;
}

export interface MarketingDecisionDependency {
  readonly id: string;
  readonly paths: readonly string[];
  readonly dependsOn?: readonly string[];
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function uniqueTexts(
  values: readonly string[],
  name: string
): readonly string[] {
  const normalized = values.map(value => requireText(value, name));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} must contain unique values`);
  }
  return normalized;
}

/** Capture the run inputs once so later candidate work cannot rewrite them. */
export function freezeMarketingDecisionContext(
  input: MarketingDecisionContextInput
): MarketingFrozenDecisionContext {
  const allowedMutationScope = uniqueTexts(
    input.allowedMutationScope,
    'allowed mutation scope'
  );
  const dependencyGraph = Object.fromEntries(
    Object.entries(input.dependencyGraph ?? {}).map(([id, dependencies]) => [
      requireText(id, 'dependency id'),
      uniqueTexts(dependencies, `dependencies for ${id}`),
    ])
  );
  const normalized = {
    decisionId: requireText(input.decisionId, 'decision id'),
    pageId: requireText(input.pageId, 'page id'),
    audience: requireText(input.audience, 'audience'),
    offer: requireText(input.offer, 'offer'),
    conversionObjective: requireText(
      input.conversionObjective,
      'conversion objective'
    ),
    claimRevision: requireText(input.claimRevision, 'claim revision'),
    recipeRevision: requireText(input.recipeRevision, 'recipe revision'),
    rubricRevision: requireText(input.rubricRevision, 'rubric revision'),
    sourceRevision: requireText(input.sourceRevision, 'source revision'),
    contextDigest: requireText(input.contextDigest, 'context digest'),
    allowedMutationScope,
    dependencyGraph,
  } satisfies MarketingFrozenDecisionContext;
  const expectedDigest = marketingDecisionContextDigest({
    decisionId: normalized.decisionId,
    pageId: normalized.pageId,
    audience: normalized.audience,
    offer: normalized.offer,
    conversionObjective: normalized.conversionObjective,
    claimRevision: normalized.claimRevision,
    recipeRevision: normalized.recipeRevision,
    rubricRevision: normalized.rubricRevision,
    sourceRevision: normalized.sourceRevision,
    allowedMutationScope: normalized.allowedMutationScope,
    dependencyGraph: normalized.dependencyGraph,
  });
  if (normalized.contextDigest !== expectedDigest) {
    throw new Error('context digest does not match the frozen decision inputs');
  }
  return freezeMarketingDecisionValue(normalized);
}

export function freezeMarketingDecisionIncumbent<TValue>(
  input: MarketingDecisionIncumbent<TValue>
): MarketingDecisionIncumbent<TValue> {
  const normalized = {
    id: requireText(input.id, 'incumbent id'),
    digest: requireText(input.digest, 'incumbent digest'),
    sourceRevision: requireText(
      input.sourceRevision,
      'incumbent source revision'
    ),
    value: cloneMarketingDecisionValue(input.value),
    dependencyIds: uniqueTexts(input.dependencyIds, 'incumbent dependencies'),
  };
  const expectedDigest = marketingDecisionIncumbentDigest(normalized);
  if (normalized.digest !== expectedDigest) {
    throw new Error('incumbent digest does not match the frozen value');
  }
  return freezeMarketingDecisionValue(normalized);
}

export function freezeMarketingDecisionCandidate<TValue>(
  input: MarketingDecisionCandidate<TValue>
): MarketingDecisionCandidate<TValue> {
  const normalized = {
    id: requireText(input.id, 'candidate id'),
    digest: requireText(input.digest, 'candidate digest'),
    value: cloneMarketingDecisionValue(input.value),
    changedPaths: uniqueTexts(input.changedPaths, 'candidate changed paths'),
    dependencyIds: uniqueTexts(input.dependencyIds, 'candidate dependencies'),
  };
  const expectedDigest = marketingDecisionCandidateDigest(normalized);
  if (normalized.digest !== expectedDigest) {
    throw new Error('candidate digest does not match the frozen value');
  }
  return freezeMarketingDecisionValue(normalized);
}

export function isMarketingMutationPathAllowed(
  path: string,
  allowedMutationScope: readonly string[]
): boolean {
  const normalizedPath = path.startsWith('$.') ? path.slice(2) : path;
  if (/^context(?:\.|$)/.test(normalizedPath)) return false;
  return allowedMutationScope.some(
    scope =>
      scope === '*' ||
      path === scope ||
      (scope.endsWith('.*') && path.startsWith(scope.slice(0, -1)))
  );
}

export {
  invalidateMarketingDecisionDependencies,
  selectMarketingDecision,
  validateMarketingDecisionCandidate,
  validateMarketingDecisionCandidates,
} from './decisionPolicy';

export function resolveMarketingEligibility(input: {
  readonly checks: readonly MarketingProtectedCheck[];
  readonly requiredDimensions?: readonly string[];
  readonly candidateId?: string;
}): MarketingCandidateEligibility {
  const findings: MarketingDecisionFinding[] = [];
  const rawRequired = input.requiredDimensions as unknown;
  const callerRequired = Array.isArray(rawRequired) && rawRequired.length > 0;
  const requiredSource = callerRequired
    ? rawRequired
    : MARKETING_PROTECTED_DIMENSIONS;
  const normalizedRequired = requiredSource.map(value =>
    typeof value === 'string' ? value.trim() : ''
  );
  const required = [...new Set(normalizedRequired.filter(Boolean))];
  if (
    (rawRequired !== undefined && !Array.isArray(rawRequired)) ||
    normalizedRequired.some(value => value.length === 0) ||
    new Set(normalizedRequired.filter(Boolean)).size !==
      normalizedRequired.filter(Boolean).length
  ) {
    findings.push({
      code: 'protected-check-uncertain',
      candidateId: input.candidateId,
      message: 'Required protected dimensions must be unique nonempty strings.',
    });
  }
  const checksByDimension = new Map<string, MarketingProtectedCheck>();
  const rawChecks = input.checks as unknown;
  const checks = Array.isArray(rawChecks)
    ? rawChecks.filter(
        (check): check is MarketingProtectedCheck =>
          typeof check === 'object' && check !== null
      )
    : [];
  const completeChecks = [...checks];
  if (!Array.isArray(rawChecks) || checks.length !== rawChecks.length) {
    findings.push({
      code: 'protected-check-uncertain',
      candidateId: input.candidateId,
      message: 'Protected eligibility checks must be well-formed records.',
    });
  }
  for (const check of checks) {
    const dimension =
      typeof check?.dimension === 'string' ? check.dimension.trim() : '';
    const verdict = check?.verdict;
    if (!dimension || checksByDimension.has(dimension)) {
      findings.push({
        code: 'protected-check-uncertain',
        candidateId: input.candidateId,
        dimension: dimension || undefined,
        message: 'Protected eligibility checks must have unique dimensions.',
      });
      continue;
    }
    checksByDimension.set(dimension, check);
    if (!['pass', 'fail', 'uncertain'].includes(verdict)) {
      findings.push({
        code: 'protected-check-uncertain',
        candidateId: input.candidateId,
        dimension,
        message: `${dimension} returned an invalid protected verdict.`,
      });
      continue;
    }
    if (
      !Array.isArray(check.evidenceRefs) ||
      check.evidenceRefs.length === 0 ||
      !check.evidenceRefs.every(
        evidenceRef =>
          typeof evidenceRef === 'string' && evidenceRef.trim().length > 0
      )
    ) {
      findings.push({
        code: 'protected-check-uncertain',
        candidateId: input.candidateId,
        dimension,
        message: `${dimension} is missing bound evidence.`,
      });
    }
  }
  for (const dimension of required) {
    if (!checksByDimension.has(dimension)) {
      completeChecks.push({
        dimension,
        verdict: 'uncertain',
        evidenceRefs: [],
        finding: 'required protected evidence is missing',
      });
      findings.push({
        code: 'missing-protected-check',
        candidateId: input.candidateId,
        dimension,
        message: `${dimension} has no protected eligibility result.`,
      });
    }
  }
  for (const check of completeChecks) {
    if (!['pass', 'fail', 'uncertain'].includes(check.verdict)) {
      continue;
    }
    if (check.verdict === 'fail') {
      findings.push({
        code: 'protected-check-failed',
        candidateId: input.candidateId,
        dimension: check.dimension,
        message: check.finding ?? `${check.dimension} failed.`,
      });
    } else if (check.verdict === 'uncertain') {
      findings.push({
        code: 'protected-check-uncertain',
        candidateId: input.candidateId,
        dimension: check.dimension,
        message: check.finding ?? `${check.dimension} is uncertain.`,
      });
    }
    if (
      !Array.isArray(check.evidenceRefs) ||
      check.evidenceRefs.length === 0 ||
      !check.evidenceRefs.every(
        evidenceRef =>
          typeof evidenceRef === 'string' && evidenceRef.trim().length > 0
      )
    ) {
      // Missing proof is uncertainty even when an untrusted caller says pass.
      findings.push({
        code: 'protected-check-uncertain',
        candidateId: input.candidateId,
        dimension: check.dimension,
        message: `${check.dimension} has no usable evidence reference.`,
      });
    }
  }
  const hasFailure = completeChecks.some(check => check.verdict === 'fail');
  const hasUncertainty =
    completeChecks.some(check => check.verdict === 'uncertain') ||
    findings.some(
      finding =>
        finding.code === 'protected-check-uncertain' ||
        finding.code === 'missing-protected-check'
    );
  return freezeMarketingDecisionValue({
    status: hasFailure
      ? 'ineligible'
      : hasUncertainty
        ? 'uncertain'
        : 'eligible',
    checks: completeChecks,
    requiredDimensions: required,
    findings,
  });
}
