import {
  freezeMarketingDecisionCandidate,
  freezeMarketingDecisionContext,
  freezeMarketingDecisionIncumbent,
  invalidateMarketingDecisionDependencies,
  type MarketingCandidateEligibility,
  type MarketingCandidateEvaluation,
  type MarketingDecisionCandidate,
  type MarketingDecisionStopReason,
  type MarketingPreferenceDecision,
  type MarketingRepairInstruction,
  marketingDecisionDigest,
  marketingDecisionIncumbentDigest,
  resolveMarketingEligibility,
  selectMarketingDecision,
  validateMarketingDecisionCandidates,
} from './decision';
import {
  MARKETING_DECISION_TOTAL_ATTEMPT_LIMIT,
  MARKETING_STAGE_ATTEMPT_LIMITS,
} from './generation';
import type {
  MarketingImprovementAttempt,
  MarketingImprovementLoopInput,
  MarketingImprovementLoopResult,
} from './improvementContracts';
import {
  eligibilityFromMarketingSemanticReviews,
  inferMarketingRepair,
  marketingRepairFailureKey,
} from './improvementEligibility';
import { finishMarketingImprovement } from './improvementFinish';
import { marketingSemanticOutcomeRecordsForCandidate } from './improvementOutcomes';
import {
  type MarketingSemanticOutcomeRecord,
  type MarketingSemanticReviewLike,
} from './improvementRecords';
import {
  isMarketingCandidateEligibility,
  isMarketingPreferenceDecision,
  isMarketingSemanticReviewLike,
} from './improvementRuntime';

export type {
  MarketingImprovementAttempt,
  MarketingImprovementLoopInput,
  MarketingImprovementLoopResult,
} from './improvementContracts';
export { eligibilityFromMarketingSemanticReviews } from './improvementEligibility';
export type {
  MarketingCommercialOutcomeLink,
  MarketingCommercialOutcomeRecord,
  MarketingCommercialOutcomeStatus,
  MarketingImprovementOutcomeBundle,
  MarketingSemanticOutcomeRecord,
  MarketingSemanticReviewLike,
  MarketingSemanticReviewStatus,
  MarketingTasteOutcomeRecord,
  MarketingTasteOutcomeStatus,
} from './improvementRecords';
export {
  MARKETING_COMMERCIAL_OUTCOME_SCHEMA,
  MARKETING_PAGE_IMPROVEMENT_SCHEMA,
  MARKETING_SEMANTIC_OUTCOME_SCHEMA,
  MARKETING_TASTE_OUTCOME_SCHEMA,
} from './improvementRecords';

export async function runMarketingPageImprovementLoop<TValue>(
  input: MarketingImprovementLoopInput<TValue>
): Promise<MarketingImprovementLoopResult<TValue>> {
  if (!input.evaluateEligibility && !input.reviewSemantic) {
    throw new Error('an eligibility or semantic reviewer is required');
  }
  const context = freezeMarketingDecisionContext(input.context);
  const initialIncumbent = freezeMarketingDecisionIncumbent(input.incumbent);
  let incumbent = initialIncumbent;
  const stageAttemptLimit = Math.min(
    input.stageAttemptLimit ?? MARKETING_STAGE_ATTEMPT_LIMITS[input.stage],
    MARKETING_STAGE_ATTEMPT_LIMITS[input.stage]
  );
  const totalAttemptLimit = Math.min(
    input.totalAttemptLimit ?? MARKETING_DECISION_TOTAL_ATTEMPT_LIMIT,
    MARKETING_DECISION_TOTAL_ATTEMPT_LIMIT
  );
  if (
    !Number.isInteger(stageAttemptLimit) ||
    stageAttemptLimit < 1 ||
    !Number.isInteger(totalAttemptLimit) ||
    totalAttemptLimit < 1
  ) {
    throw new Error('improvement attempt limits must be positive integers');
  }
  const attempts: MarketingImprovementAttempt<TValue>[] = [];
  let totalAttempts = 0;
  let stageAttempts = 0;
  let repair: readonly MarketingRepairInstruction[] = [];
  let previousFailureKey = '';
  let repeatedFailureCount = 0;
  const seenCandidatePayloadKeys = new Set<string>();
  const semanticOutcomeRecordsForRun: MarketingSemanticOutcomeRecord[] = [];
  let selectedCandidateDigest = incumbent.digest;
  let finalStatus: MarketingImprovementLoopResult<TValue>['status'] =
    'unresolved';
  let finalStopReason: MarketingDecisionStopReason = 'no-candidates';
  let invalidatedDependencyIds: readonly string[] = [];

  const finish = async (): Promise<MarketingImprovementLoopResult<TValue>> =>
    finishMarketingImprovement({
      input,
      context,
      initialIncumbent,
      incumbent,
      selectedCandidateDigest,
      finalStatus,
      finalStopReason,
      attempts,
      invalidatedDependencyIds,
      semanticOutcomeRecordsForRun,
    });

  const stopForUnavailable = async (): Promise<
    MarketingImprovementLoopResult<TValue>
  > => {
    finalStopReason = 'reviewer-unavailable';
    return finish();
  };
  const unavailableEligibility = (
    candidateId: string
  ): MarketingCandidateEligibility => ({
    ...resolveMarketingEligibility({
      candidateId,
      checks: [
        {
          dimension: 'reviewer',
          verdict: 'uncertain',
          evidenceRefs: ['reviewer-unavailable'],
          finding: 'reviewer callback failed or was unavailable',
        },
      ],
      requiredDimensions: ['reviewer'],
    }),
    stopReason: 'reviewer-unavailable',
  });

  while (true) {
    if (input.signal?.aborted) return stopForUnavailable();
    if (totalAttempts >= totalAttemptLimit) {
      finalStopReason = 'total-budget-exhausted';
      return finish();
    }
    if (stageAttempts >= stageAttemptLimit) {
      finalStopReason = 'stage-budget-exhausted';
      return finish();
    }
    totalAttempts += 1;
    stageAttempts += 1;
    let generated: readonly MarketingDecisionCandidate<TValue>[];
    try {
      if (input.signal?.aborted) return stopForUnavailable();
      generated = await input.generateCandidates({
        context,
        incumbent,
        stage: input.stage,
        attempt: totalAttempts,
        repair,
      });
    } catch {
      return stopForUnavailable();
    }
    if (!Array.isArray(generated)) return stopForUnavailable();
    if (generated.length === 0) {
      finalStopReason = 'no-candidates';
      return finish();
    }
    let candidates: readonly MarketingDecisionCandidate<TValue>[];
    try {
      candidates = generated.map(candidate =>
        freezeMarketingDecisionCandidate(candidate)
      );
    } catch {
      finalStopReason = 'mutation-out-of-scope';
      return finish();
    }
    const candidatePayloadKeys = candidates.map(candidate =>
      marketingDecisionDigest({
        contextDigest: context.contextDigest,
        value: candidate.value,
      })
    );
    const candidatePayloadKeySet = new Set(candidatePayloadKeys);
    if (
      candidatePayloadKeySet.size !== candidates.length ||
      candidatePayloadKeys.some(key => seenCandidatePayloadKeys.has(key))
    ) {
      finalStopReason = 'repeated-failure';
      attempts.push({
        attempt: totalAttempts,
        stageAttempt: stageAttempts,
        candidates,
        validationFindings: ['candidate payload repeated across attempts'],
        evaluations: [],
        semanticReviews: [],
        preference: null,
        selection: null,
        repairs: repair,
      });
      return finish();
    }
    candidatePayloadKeys.forEach(key => seenCandidatePayloadKeys.add(key));
    const validationFindings = validateMarketingDecisionCandidates({
      context,
      incumbent,
      candidates,
    });
    if (validationFindings.length > 0) {
      attempts.push({
        attempt: totalAttempts,
        stageAttempt: stageAttempts,
        candidates,
        validationFindings: validationFindings.map(finding => finding.message),
        evaluations: [],
        semanticReviews: [],
        preference: null,
        selection: null,
        repairs: [],
      });
      finalStopReason = validationFindings.some(
        finding => finding.code === 'candidate-count-out-of-range'
      )
        ? 'candidate-limit'
        : 'mutation-out-of-scope';
      return finish();
    }

    const evaluations: MarketingCandidateEvaluation<TValue>[] = [];
    const semanticReviews: MarketingSemanticReviewLike[] = [];
    for (const candidate of candidates) {
      let direct: MarketingCandidateEligibility | null = null;
      let reviews: readonly MarketingSemanticReviewLike[] = [];
      try {
        if (input.signal?.aborted) return stopForUnavailable();
        direct = input.evaluateEligibility
          ? await input.evaluateEligibility({
              context,
              incumbent,
              candidate,
              stage: input.stage,
              attempt: totalAttempts,
            })
          : null;
        if (input.signal?.aborted) return stopForUnavailable();
        reviews = input.reviewSemantic
          ? ((await input.reviewSemantic({
              context,
              incumbent,
              candidate,
              stage: input.stage,
              attempt: totalAttempts,
            })) ?? [])
          : [];
        if (
          (input.evaluateEligibility &&
            !isMarketingCandidateEligibility(direct)) ||
          !Array.isArray(reviews) ||
          !reviews.every(review => isMarketingSemanticReviewLike(review))
        ) {
          throw new Error('reviewer returned an invalid decision record');
        }
      } catch {
        evaluations.push({
          candidate,
          eligibility: unavailableEligibility(candidate.id),
        });
        continue;
      }
      semanticReviews.push(...reviews);
      semanticOutcomeRecordsForRun.push(
        ...marketingSemanticOutcomeRecordsForCandidate({
          decisionId: context.decisionId,
          contextDigest: context.contextDigest,
          candidate,
          reviews,
        })
      );
      const semanticEligibility = input.reviewSemantic
        ? eligibilityFromMarketingSemanticReviews({
            candidateId: candidate.id,
            reviews,
            requiredDimensions: [
              'claim-support',
              'new-information',
              'cta-expectation',
            ],
          })
        : null;
      const eligibility: MarketingCandidateEligibility =
        direct && semanticEligibility
          ? {
              ...resolveMarketingEligibility({
                checks: [...direct.checks, ...semanticEligibility.checks],
                candidateId: candidate.id,
              }),
              repair: direct.repair ?? semanticEligibility.repair,
              stopReason: direct.stopReason ?? semanticEligibility.stopReason,
            }
          : (direct ?? semanticEligibility!);
      evaluations.push({ candidate, eligibility });
    }
    const protectedEvaluations = evaluations.map(evaluation => ({
      candidate: evaluation.candidate,
      eligibility: {
        ...resolveMarketingEligibility({
          checks: evaluation.eligibility.checks,
          requiredDimensions: evaluation.eligibility.requiredDimensions,
          candidateId: evaluation.candidate.id,
        }),
        repair: evaluation.eligibility.repair,
        stopReason: evaluation.eligibility.stopReason,
      },
    }));
    const repairs = protectedEvaluations
      .map(inferMarketingRepair)
      .filter(
        (value): value is MarketingRepairInstruction => value !== undefined
      );
    const eligibleCandidates = protectedEvaluations
      .filter(evaluation => evaluation.eligibility.status === 'eligible')
      .map(evaluation => evaluation.candidate);
    let preference: MarketingPreferenceDecision;
    if (eligibleCandidates.length === 0) {
      preference = {
        contextDigest: context.contextDigest,
        incumbentDigest: incumbent.digest,
        status: 'unavailable',
        comparedCandidateIds: [],
        reason: 'no protected-eligible candidates',
      };
    } else if (!input.choosePreference) {
      preference = {
        contextDigest: context.contextDigest,
        incumbentDigest: incumbent.digest,
        status: 'unavailable',
        comparedCandidateIds: eligibleCandidates.map(candidate => candidate.id),
        reason: 'preference evaluator is unavailable',
      };
    } else {
      try {
        if (input.signal?.aborted) return stopForUnavailable();
        preference = await input.choosePreference({
          context,
          incumbent,
          eligibleCandidates,
          stage: input.stage,
          attempt: totalAttempts,
        });
        if (!isMarketingPreferenceDecision(preference)) {
          throw new Error('preference evaluator returned an invalid decision');
        }
      } catch {
        return stopForUnavailable();
      }
    }
    const selection = selectMarketingDecision({
      contextDigest: context.contextDigest,
      stage: input.stage,
      incumbent,
      evaluations: protectedEvaluations,
      preference,
      invalidatedDependencyIds,
    });
    attempts.push({
      attempt: totalAttempts,
      stageAttempt: stageAttempts,
      candidates,
      validationFindings: [],
      evaluations: selection.evaluations,
      semanticReviews,
      preference,
      selection,
      repairs,
    });
    const immediateStop = selection.evaluations.find(
      evaluation => evaluation.eligibility.stopReason
    )?.eligibility.stopReason;
    if (selection.status === 'accepted' && selection.selectedCandidate) {
      selectedCandidateDigest = selection.selectedCandidate.digest;
      incumbent = freezeMarketingDecisionIncumbent({
        id: selection.selectedCandidate.id,
        digest: marketingDecisionIncumbentDigest({
          id: selection.selectedCandidate.id,
          sourceRevision: context.sourceRevision,
          value: selection.selectedCandidate.value,
          dependencyIds: selection.selectedCandidate.dependencyIds,
        }),
        sourceRevision: context.sourceRevision,
        value: selection.selectedCandidate.value,
        dependencyIds: selection.selectedCandidate.dependencyIds,
      });
      const changedPaths = selection.selectedCandidate.changedPaths;
      const derived = input.dependencies
        ? invalidateMarketingDecisionDependencies({
            changedPaths,
            dependencies: input.dependencies,
          })
        : [];
      invalidatedDependencyIds = [
        ...new Set([...derived, ...selection.selectedCandidate.dependencyIds]),
      ].sort((left, right) => left.localeCompare(right));
      finalStatus = 'accepted';
      finalStopReason = 'accepted-improvement';
      return finish();
    }
    if (
      selection.stopReason === 'incumbent-retained-tie' ||
      selection.stopReason === 'incumbent-retained-uncertainty' ||
      selection.stopReason === 'incumbent-retained-preference' ||
      selection.stopReason === 'preference-unavailable'
    ) {
      finalStatus = 'incumbent-retained';
      finalStopReason = selection.stopReason;
      return finish();
    }
    if (immediateStop) {
      finalStopReason = immediateStop;
      return finish();
    }
    if (repairs.length === 0) {
      finalStopReason = 'no-eligible-candidate';
      return finish();
    }
    const nextFailureKey = marketingRepairFailureKey(repairs);
    repeatedFailureCount =
      nextFailureKey === previousFailureKey ? repeatedFailureCount + 1 : 1;
    previousFailureKey = nextFailureKey;
    if (repeatedFailureCount >= 2) {
      finalStopReason = 'repeated-failure';
      return finish();
    }
    repair = repairs;
  }
}
