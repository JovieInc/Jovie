import type {
  MarketingCandidateEligibility,
  MarketingCandidateEvaluation,
  MarketingDecisionCandidate,
  MarketingDecisionContextInput,
  MarketingDecisionDependency,
  MarketingDecisionIncumbent,
  MarketingDecisionSelection,
  MarketingDecisionStopReason,
  MarketingFrozenDecisionContext,
  MarketingPreferenceDecision,
  MarketingRepairInstruction,
} from './decision';
import type { MarketingGenerationStage } from './generation';
import {
  MARKETING_PAGE_IMPROVEMENT_SCHEMA,
  type MarketingCommercialOutcomeLink,
  type MarketingCommercialOutcomeRecord,
  type MarketingImprovementOutcomeBundle,
  type MarketingSemanticReviewLike,
  type MarketingTasteOutcomeRecord,
} from './improvementRecords';

export interface MarketingImprovementAttempt<TValue = unknown> {
  readonly attempt: number;
  readonly stageAttempt: number;
  readonly candidates: readonly MarketingDecisionCandidate<TValue>[];
  readonly validationFindings: readonly string[];
  readonly evaluations: readonly MarketingCandidateEvaluation<TValue>[];
  readonly semanticReviews: readonly MarketingSemanticReviewLike[];
  readonly preference: MarketingPreferenceDecision | null;
  readonly selection: MarketingDecisionSelection<TValue> | null;
  readonly repairs: readonly MarketingRepairInstruction[];
}

export interface MarketingImprovementLoopResult<TValue = unknown> {
  readonly schema: typeof MARKETING_PAGE_IMPROVEMENT_SCHEMA;
  readonly context: MarketingFrozenDecisionContext;
  readonly initialIncumbent: MarketingDecisionIncumbent<TValue>;
  readonly finalIncumbent: MarketingDecisionIncumbent<TValue>;
  readonly selectedCandidateDigest: string;
  readonly status: 'accepted' | 'incumbent-retained' | 'unresolved';
  readonly stopReason: MarketingDecisionStopReason;
  readonly attempts: readonly MarketingImprovementAttempt<TValue>[];
  readonly invalidatedDependencyIds: readonly string[];
  readonly outcomes: MarketingImprovementOutcomeBundle;
  readonly composition: {
    readonly status:
      | 'accepted-for-composition'
      | 'incumbent-retained'
      | 'unresolved';
    readonly candidateDigest: string;
    readonly requiresRevalidation: true;
  };
  readonly certificate: {
    readonly certified: false;
    readonly reason: 'composition-decision-is-not-a-certificate';
  };
}

export interface MarketingImprovementLoopInput<TValue = unknown> {
  readonly context:
    | MarketingFrozenDecisionContext
    | MarketingDecisionContextInput;
  readonly stage: MarketingGenerationStage;
  readonly incumbent: MarketingDecisionIncumbent<TValue>;
  readonly generateCandidates: (input: {
    readonly context: MarketingFrozenDecisionContext;
    readonly incumbent: MarketingDecisionIncumbent<TValue>;
    readonly stage: MarketingGenerationStage;
    readonly attempt: number;
    readonly repair: readonly MarketingRepairInstruction[];
  }) =>
    | readonly MarketingDecisionCandidate<TValue>[]
    | Promise<readonly MarketingDecisionCandidate<TValue>[]>;
  readonly evaluateEligibility?: (input: {
    readonly context: MarketingFrozenDecisionContext;
    readonly incumbent: MarketingDecisionIncumbent<TValue>;
    readonly candidate: MarketingDecisionCandidate<TValue>;
    readonly stage: MarketingGenerationStage;
    readonly attempt: number;
  }) => MarketingCandidateEligibility | Promise<MarketingCandidateEligibility>;
  readonly reviewSemantic?: (input: {
    readonly context: MarketingFrozenDecisionContext;
    readonly incumbent: MarketingDecisionIncumbent<TValue>;
    readonly candidate: MarketingDecisionCandidate<TValue>;
    readonly stage: MarketingGenerationStage;
    readonly attempt: number;
  }) =>
    | readonly MarketingSemanticReviewLike[]
    | Promise<readonly MarketingSemanticReviewLike[]>;
  readonly choosePreference?: (input: {
    readonly context: MarketingFrozenDecisionContext;
    readonly incumbent: MarketingDecisionIncumbent<TValue>;
    readonly eligibleCandidates: readonly MarketingDecisionCandidate<TValue>[];
    readonly stage: MarketingGenerationStage;
    readonly attempt: number;
  }) => MarketingPreferenceDecision | Promise<MarketingPreferenceDecision>;
  readonly dependencies?: readonly MarketingDecisionDependency[];
  readonly stageAttemptLimit?: number;
  readonly totalAttemptLimit?: number;
  readonly commercialLink?: MarketingCommercialOutcomeLink;
  readonly buildTasteOutcome?: (input: {
    readonly context: MarketingFrozenDecisionContext;
    readonly finalIncumbent: MarketingDecisionIncumbent<TValue>;
    readonly candidateDigest: string;
  }) => MarketingTasteOutcomeRecord;
  readonly buildCommercialOutcome?: (input: {
    readonly context: MarketingFrozenDecisionContext;
    readonly finalIncumbent: MarketingDecisionIncumbent<TValue>;
    readonly candidateDigest: string;
    readonly link: MarketingCommercialOutcomeLink | null;
  }) => MarketingCommercialOutcomeRecord;
  readonly recordOutcomes?: (
    outcomes: MarketingImprovementOutcomeBundle
  ) => void | Promise<void>;
  readonly signal?: AbortSignal;
}
