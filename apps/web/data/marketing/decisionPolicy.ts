import {
  MARKETING_DECISION_SCHEMA_VERSION,
  type MarketingCandidateEvaluation,
  type MarketingDecisionCandidate,
  type MarketingDecisionDependency,
  type MarketingDecisionFinding,
  type MarketingDecisionIncumbent,
  type MarketingDecisionSelection,
  type MarketingDecisionStopReason,
  type MarketingFrozenDecisionContext,
  type MarketingPreferenceDecision,
  resolveMarketingEligibility,
} from './decision';
import {
  collectChangedMarketingLeafPaths,
  freezeMarketingDecisionValue,
  marketingPathCovered,
} from './decisionEvidence';
import {
  MARKETING_DECISION_CANDIDATE_MAX,
  MARKETING_DECISION_CANDIDATE_MIN,
  type MarketingGenerationStage,
} from './generation';

const PROTECTED_CONTEXT_PATH = /^context(?:\.|$)/;

function pathMatches(path: string, scope: string): boolean {
  return (
    scope === '*' ||
    path === scope ||
    (scope.endsWith('.*') && path.startsWith(scope.slice(0, -1)))
  );
}

export function validateMarketingDecisionCandidate<TValue>(input: {
  readonly context: MarketingFrozenDecisionContext;
  readonly incumbent?: MarketingDecisionIncumbent<TValue>;
  readonly candidate: MarketingDecisionCandidate<TValue>;
}): readonly MarketingDecisionFinding[] {
  const paths = input.candidate.changedPaths;
  const findings: MarketingDecisionFinding[] = [];
  if (paths.length === 0) {
    findings.push({
      code: 'candidate-no-change',
      candidateId: input.candidate.id,
      message: 'A challenger must declare at least one changed path.',
    });
  }
  if (input.incumbent) {
    const actualChangedPaths = collectChangedMarketingLeafPaths(
      input.incumbent.value,
      input.candidate.value
    );
    const declaredChanges = new Set(paths);
    for (const actualPath of actualChangedPaths) {
      const normalizedActualPath = actualPath.startsWith('$.')
        ? actualPath.slice(2)
        : actualPath;
      if (PROTECTED_CONTEXT_PATH.test(normalizedActualPath)) {
        findings.push({
          code: 'mutation-out-of-scope',
          candidateId: input.candidate.id,
          message: `Actual mutation ${actualPath} cannot rewrite frozen decision context.`,
        });
      }
      if (!paths.some(path => marketingPathCovered(actualPath, path))) {
        findings.push({
          code: 'mutation-out-of-scope',
          candidateId: input.candidate.id,
          message: `Actual mutation ${actualPath} is missing from the declared mutation scope.`,
        });
      }
    }
    for (const declaredPath of paths) {
      if (
        declaredPath !== '*' &&
        !actualChangedPaths.some(path =>
          marketingPathCovered(path, declaredPath)
        )
      ) {
        findings.push({
          code: 'candidate-no-change',
          candidateId: input.candidate.id,
          message: `Declared mutation ${declaredPath} does not change the incumbent value.`,
        });
      }
    }
    if (actualChangedPaths.length === 0 && declaredChanges.size > 0) {
      findings.push({
        code: 'candidate-no-change',
        candidateId: input.candidate.id,
        message: 'The candidate value is identical to the incumbent value.',
      });
    }
  }
  if (new Set(paths).size !== paths.length) {
    findings.push({
      code: 'duplicate-mutation-path',
      candidateId: input.candidate.id,
      message: 'Candidate changed paths must be unique.',
    });
  }
  for (const path of paths) {
    if (
      PROTECTED_CONTEXT_PATH.test(path) ||
      !input.context.allowedMutationScope.some(scope =>
        pathMatches(path, scope)
      )
    ) {
      findings.push({
        code: 'mutation-out-of-scope',
        candidateId: input.candidate.id,
        message: `Candidate mutation ${path} is outside the frozen allowed scope.`,
      });
    }
  }
  return findings;
}

export function validateMarketingDecisionCandidates<TValue>(input: {
  readonly context: MarketingFrozenDecisionContext;
  readonly incumbent?: MarketingDecisionIncumbent<TValue>;
  readonly candidates: readonly MarketingDecisionCandidate<TValue>[];
}): readonly MarketingDecisionFinding[] {
  const findings: MarketingDecisionFinding[] = [];
  if (
    input.candidates.length < MARKETING_DECISION_CANDIDATE_MIN ||
    input.candidates.length > MARKETING_DECISION_CANDIDATE_MAX
  ) {
    findings.push({
      code: 'candidate-count-out-of-range',
      message: `A decision requires ${MARKETING_DECISION_CANDIDATE_MIN}-${MARKETING_DECISION_CANDIDATE_MAX} candidates.`,
    });
  }
  const ids = input.candidates.map(candidate => candidate.id);
  for (const candidate of input.candidates) {
    if (ids.filter(id => id === candidate.id).length > 1) {
      findings.push({
        code: 'duplicate-candidate-id',
        candidateId: candidate.id,
        message: 'Candidate IDs must be unique within an attempt.',
      });
    }
    findings.push(
      ...validateMarketingDecisionCandidate({
        context: input.context,
        incumbent: input.incumbent,
        candidate,
      })
    );
  }
  return findings;
}

function dependencyPathMatches(path: string, dependencyPath: string): boolean {
  return pathMatches(path, dependencyPath) || pathMatches(dependencyPath, path);
}

function hasUsablePreference(value: MarketingPreferenceDecision): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as unknown as Record<string, unknown>;
  const status = candidate.status;
  return (
    typeof candidate.contextDigest === 'string' &&
    typeof candidate.incumbentDigest === 'string' &&
    ['candidate', 'incumbent', 'tie', 'uncertain', 'unavailable'].includes(
      String(status)
    ) &&
    Array.isArray(candidate.comparedCandidateIds) &&
    candidate.comparedCandidateIds.every(id => typeof id === 'string') &&
    typeof candidate.reason === 'string' &&
    (status !== 'candidate' || typeof candidate.candidateId === 'string')
  );
}

/** Invalidate direct and transitive evidence after an accepted mutation. */
export function invalidateMarketingDecisionDependencies(input: {
  readonly changedPaths: readonly string[];
  readonly dependencies: readonly MarketingDecisionDependency[];
}): readonly string[] {
  const invalidated = new Set<string>();
  for (const dependency of input.dependencies) {
    if (
      dependency.paths.some(dependencyPath =>
        input.changedPaths.some(path =>
          dependencyPathMatches(path, dependencyPath)
        )
      )
    ) {
      invalidated.add(dependency.id);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const dependency of input.dependencies) {
      if (
        dependency.dependsOn?.some(parent => invalidated.has(parent)) &&
        !invalidated.has(dependency.id)
      ) {
        invalidated.add(dependency.id);
        changed = true;
      }
    }
  }
  return [...invalidated].sort((left, right) => left.localeCompare(right));
}

export function selectMarketingDecision<TValue>(input: {
  readonly contextDigest: string;
  readonly stage: MarketingGenerationStage;
  readonly incumbent: MarketingDecisionIncumbent<TValue>;
  readonly evaluations: readonly MarketingCandidateEvaluation<TValue>[];
  readonly preference: MarketingPreferenceDecision;
  readonly invalidatedDependencyIds?: readonly string[];
}): MarketingDecisionSelection<TValue> {
  const evaluations = input.evaluations.map(evaluation => {
    const resolved = resolveMarketingEligibility({
      checks: evaluation.eligibility.checks,
      requiredDimensions: evaluation.eligibility.requiredDimensions,
      candidateId: evaluation.candidate.id,
    });
    return {
      candidate: evaluation.candidate,
      eligibility: {
        ...resolved,
        repair: evaluation.eligibility.repair,
        stopReason: evaluation.eligibility.stopReason,
      },
    };
  });
  const eligible = evaluations.filter(
    evaluation => evaluation.eligibility.status === 'eligible'
  );
  const eligibleIds = eligible.map(evaluation => evaluation.candidate.id);
  let status: MarketingDecisionSelection<TValue>['status'] =
    'incumbent-retained';
  let selectedCandidate: MarketingDecisionCandidate<TValue> | null = null;
  let stopReason: MarketingDecisionStopReason = 'no-eligible-candidate';

  if (eligible.length > 0) {
    if (!hasUsablePreference(input.preference)) {
      stopReason = 'preference-unavailable';
    } else {
      const comparedIds = [...input.preference.comparedCandidateIds].sort(
        (a, b) => a.localeCompare(b)
      );
      const expectedIds = [...eligibleIds].sort((a, b) => a.localeCompare(b));
      const preferenceBound =
        input.preference.contextDigest === input.contextDigest &&
        input.preference.incumbentDigest === input.incumbent.digest;
      const preferenceComparedAll =
        comparedIds.length === expectedIds.length &&
        comparedIds.every((id, index) => id === expectedIds[index]);
      if (!preferenceBound || !preferenceComparedAll) {
        stopReason = 'preference-unavailable';
      } else if (input.preference.status === 'candidate') {
        const selected = eligible.find(
          evaluation => evaluation.candidate.id === input.preference.candidateId
        );
        if (selected) {
          selectedCandidate = selected.candidate;
          status = 'accepted';
          stopReason = 'accepted-improvement';
        } else {
          stopReason = 'preference-unavailable';
        }
      } else if (input.preference.status === 'incumbent') {
        stopReason = 'incumbent-retained-preference';
      } else if (input.preference.status === 'tie') {
        stopReason = 'incumbent-retained-tie';
      } else if (input.preference.status === 'unavailable') {
        stopReason = 'preference-unavailable';
      } else {
        stopReason = 'incumbent-retained-uncertainty';
      }
    }
  } else {
    const uncertainEvaluation = evaluations.find(
      evaluation => evaluation.eligibility.status === 'uncertain'
    );
    if (uncertainEvaluation?.eligibility.stopReason) {
      stopReason = uncertainEvaluation.eligibility.stopReason;
    } else if (uncertainEvaluation) {
      stopReason = 'incumbent-retained-uncertainty';
    }
  }

  return freezeMarketingDecisionValue({
    schema: MARKETING_DECISION_SCHEMA_VERSION,
    stage: input.stage,
    incumbent: input.incumbent,
    selectedCandidate,
    status,
    stopReason,
    evaluations,
    eligibleCandidateIds: eligibleIds,
    invalidatedDependencyIds: [...(input.invalidatedDependencyIds ?? [])].sort(
      (left, right) => left.localeCompare(right)
    ),
    certified: false,
  });
}
