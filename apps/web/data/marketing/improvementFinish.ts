import {
  freezeMarketingDecisionValue,
  type MarketingDecisionIncumbent,
  type MarketingDecisionStopReason,
  type MarketingFrozenDecisionContext,
} from './decision';
import type {
  MarketingImprovementAttempt,
  MarketingImprovementLoopInput,
  MarketingImprovementLoopResult,
} from './improvementContracts';
import {
  defaultMarketingCommercialOutcome,
  defaultMarketingTasteOutcome,
  directMarketingSemanticOutcomeRecords,
  normalizeMarketingCommercialOutcome,
  normalizeMarketingTasteOutcome,
} from './improvementOutcomes';
import {
  MARKETING_PAGE_IMPROVEMENT_SCHEMA,
  type MarketingImprovementOutcomeBundle,
  type MarketingSemanticOutcomeRecord,
} from './improvementRecords';

export async function finishMarketingImprovement<TValue>(state: {
  readonly input: MarketingImprovementLoopInput<TValue>;
  readonly context: MarketingFrozenDecisionContext;
  readonly initialIncumbent: MarketingDecisionIncumbent<TValue>;
  readonly incumbent: MarketingDecisionIncumbent<TValue>;
  readonly selectedCandidateDigest: string;
  readonly finalStatus: MarketingImprovementLoopResult<TValue>['status'];
  readonly finalStopReason: MarketingDecisionStopReason;
  readonly attempts: readonly MarketingImprovementAttempt<TValue>[];
  readonly invalidatedDependencyIds: readonly string[];
  readonly semanticOutcomeRecordsForRun: readonly MarketingSemanticOutcomeRecord[];
}): Promise<MarketingImprovementLoopResult<TValue>> {
  const {
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
  } = state;
  const fallbackTaste = defaultMarketingTasteOutcome({
    context,
    candidateDigest: selectedCandidateDigest,
  });
  let taste = fallbackTaste;
  if (input.buildTasteOutcome) {
    try {
      taste = normalizeMarketingTasteOutcome({
        outcome: input.buildTasteOutcome({
          context,
          finalIncumbent: incumbent,
          candidateDigest: selectedCandidateDigest,
        }),
        context,
        candidateDigest: selectedCandidateDigest,
        fallback: fallbackTaste,
      });
    } catch {
      taste = fallbackTaste;
    }
  }
  const fallbackCommercial = defaultMarketingCommercialOutcome({
    context,
    candidateDigest: selectedCandidateDigest,
    link: input.commercialLink ?? null,
  });
  let commercial = fallbackCommercial;
  if (input.buildCommercialOutcome) {
    try {
      commercial = normalizeMarketingCommercialOutcome({
        outcome: input.buildCommercialOutcome({
          context,
          finalIncumbent: incumbent,
          candidateDigest: selectedCandidateDigest,
          link: input.commercialLink ?? null,
        }),
        context,
        candidateDigest: selectedCandidateDigest,
        fallback: fallbackCommercial,
      });
    } catch {
      commercial = fallbackCommercial;
    }
  }
  const outcomes: MarketingImprovementOutcomeBundle = {
    taste,
    semantic:
      semanticOutcomeRecordsForRun.length > 0
        ? semanticOutcomeRecordsForRun
        : directMarketingSemanticOutcomeRecords({
            decisionId: context.decisionId,
            contextDigest: context.contextDigest,
            evaluations: attempts.at(-1)?.evaluations ?? [],
          }),
    commercial,
  };
  if (input.recordOutcomes) await input.recordOutcomes(outcomes);
  return freezeMarketingDecisionValue({
    schema: MARKETING_PAGE_IMPROVEMENT_SCHEMA,
    context,
    initialIncumbent,
    finalIncumbent: incumbent,
    selectedCandidateDigest,
    status: finalStatus,
    stopReason: finalStopReason,
    attempts,
    invalidatedDependencyIds,
    outcomes,
    composition: {
      status:
        finalStatus === 'accepted'
          ? 'accepted-for-composition'
          : finalStatus === 'incumbent-retained'
            ? 'incumbent-retained'
            : 'unresolved',
      candidateDigest: selectedCandidateDigest,
      requiresRevalidation: true,
    },
    certificate: {
      certified: false,
      reason: 'composition-decision-is-not-a-certificate',
    },
  });
}
