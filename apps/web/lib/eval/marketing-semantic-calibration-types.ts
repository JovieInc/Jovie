import type {
  MarketingSemanticReasonCode,
  MarketingSemanticReviewInput,
  MarketingSemanticReviewResult,
  MarketingSemanticVerdict,
} from '@/data/marketing/semanticReview';
import type { CalibrationGateResult, JudgeBinaryLabel } from './calibration';

export const MARKETING_SEMANTIC_CALIBRATION_SCHEMA_VERSION = 1 as const;
export const MIN_REAL_HUMAN_HELDOUT_CASES = 4;
export const MIN_REAL_HUMAN_HELDOUT_COVERAGE = 0.75;

export type MarketingCalibrationSplit = 'development' | 'held-out';
export type CalibrationOutcome = 'pass' | 'fail' | 'abstain';
export type MarketingCalibrationCaseOrigin =
  | 'synthetic-fixture'
  | 'public-artifact'
  | 'source-backed-constructed';
export type MarketingCalibrationObservationSource =
  | 'live-bound'
  | 'mocked'
  | 'unknown';
export type MarketingCalibrationLabelSource =
  | 'synthetic-hand-authored'
  | 'human-review';

export interface MarketingCalibrationPreference {
  readonly candidateIds: readonly string[];
  readonly preferredCandidateId: string;
  readonly blinded: boolean;
  readonly reversed: boolean;
  readonly labelSource: MarketingCalibrationLabelSource;
}

export interface MarketingSemanticCalibrationCase {
  readonly id: string;
  readonly caseId: string;
  readonly pageFamily: string;
  readonly split: MarketingCalibrationSplit;
  /** Whether the input itself is synthetic; this is separate from label provenance. */
  readonly synthetic: boolean;
  readonly caseOrigin: MarketingCalibrationCaseOrigin;
  readonly labelSource: MarketingCalibrationLabelSource;
  readonly referenceLabel: JudgeBinaryLabel;
  readonly baselineOutcome: CalibrationOutcome;
  readonly input: MarketingSemanticReviewInput;
  readonly preference?: MarketingCalibrationPreference;
}

export interface MarketingSemanticCalibrationEvaluatorObservation {
  readonly status: 'evaluated' | 'abstained';
  readonly outcome: CalibrationOutcome;
  readonly verdict: MarketingSemanticVerdict | null;
  readonly reasonCode: MarketingSemanticReasonCode | null;
  readonly sourceSha: string | null;
  readonly artifactSha256: string | null;
  readonly evidenceFingerprint: string | null;
  readonly requestFingerprint: string | null;
  readonly observationSource: MarketingCalibrationObservationSource;
  readonly model: string | null;
  readonly resolvedModel: string | null;
  readonly modelIdentityBasis: string | null;
}

export type MarketingSemanticCalibrationEvaluator = (
  row: MarketingSemanticCalibrationCase
) => Promise<MarketingSemanticReviewResult>;

export type MarketingBaselineCalibrationEvaluator = (
  row: MarketingSemanticCalibrationCase
) => CalibrationOutcome | Promise<CalibrationOutcome>;

export interface MarketingCalibrationWorkflowInput {
  readonly estimatedCostUsd?: number;
  readonly humanReviewMinutes?: number;
}

export interface MarketingSemanticCalibrationRunInput {
  readonly cases: readonly MarketingSemanticCalibrationCase[];
  readonly evaluateSemantic: MarketingSemanticCalibrationEvaluator;
  readonly evaluateBaseline?: MarketingBaselineCalibrationEvaluator;
  readonly threshold?: number;
  readonly generatedAt?: string;
  readonly workflow?: MarketingCalibrationWorkflowInput;
  readonly enforcementRequested?: boolean;
  readonly observationSource?: MarketingCalibrationObservationSource;
}

export interface MarketingCalibrationMetrics {
  readonly split: 'all' | MarketingCalibrationSplit;
  readonly totalCases: number;
  readonly evaluatedCount: number;
  readonly passCount: number;
  readonly blockCount: number;
  readonly abstentionCount: number;
  readonly falsePassCount: number;
  readonly falseBlockCount: number;
  readonly falsePassRate: number | null;
  readonly falseBlockRate: number | null;
  readonly referenceLabelCount: number;
  readonly referenceProvenance:
    | 'synthetic'
    | 'human-heldout'
    | 'mixed'
    | 'unknown';
}

export interface MarketingCalibrationMetricDelta {
  readonly falsePassCount: number;
  readonly falseBlockCount: number;
  readonly abstentionCount: number;
  readonly falsePassRate: number | null;
  readonly falseBlockRate: number | null;
}

export interface MarketingCalibrationComparison {
  readonly baseline: readonly MarketingCalibrationMetrics[];
  readonly semantic: readonly MarketingCalibrationMetrics[];
  readonly semanticMinusBaseline: readonly MarketingCalibrationMetricDelta[];
}

export interface MarketingSemanticCalibrationCaseResult {
  readonly id: string;
  readonly caseId: string;
  readonly pageFamily: string;
  readonly split: MarketingCalibrationSplit;
  readonly caseOrigin: MarketingCalibrationCaseOrigin;
  readonly referenceLabel: JudgeBinaryLabel;
  readonly labelSource: MarketingCalibrationLabelSource;
  readonly synthetic: boolean;
  readonly baselineOutcome: CalibrationOutcome;
  readonly semantic: MarketingSemanticCalibrationEvaluatorObservation;
}

export interface MarketingCalibrationAgreement {
  readonly status: 'passed' | 'failed' | 'unqualified';
  readonly reason: string;
  readonly syntheticEvidenceOnly: boolean;
  readonly eligibleCaseCount: number;
  readonly nonAbstainingCoverage: number | null;
  readonly excludedAbstentions: number;
  readonly gate: CalibrationGateResult | null;
}

export interface MarketingCalibrationPreferenceSummary {
  readonly status: 'not-applicable' | 'passed';
  readonly total: number;
  readonly valid: number;
  readonly invalid: number;
  readonly blindedCount: number;
  readonly reversedCount: number;
}

export interface MarketingCalibrationModelIdentity {
  readonly configuredAliases: readonly string[];
  readonly resolvedModelIds: readonly string[];
  readonly resolvedVersionStatus: 'observed' | 'unknown';
  readonly aliasOrVersionUnknown: boolean;
}

export interface MarketingCalibrationWorkflowReport {
  readonly semanticCalls: number;
  readonly baselineCalls: number;
  readonly estimatedCostUsd: number | null;
  readonly humanReviewMinutes: number | null;
  readonly unknowns: readonly string[];
}

export interface MarketingSemanticCalibrationReport {
  readonly schemaVersion: typeof MARKETING_SEMANTIC_CALIBRATION_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly corpus: {
    readonly caseCount: number;
    readonly developmentCount: number;
    readonly heldOutCount: number;
    readonly realHumanHeldOutCount: number;
    readonly syntheticCaseCount: number;
    readonly syntheticLabelCount: number;
    readonly mockedObservationCount: number;
    readonly liveBoundObservationCount: number;
    readonly unknownObservationCount: number;
    readonly pageFamilies: readonly string[];
    readonly syntheticDataCannotPromote: true;
  };
  readonly baseline: readonly MarketingCalibrationMetrics[];
  readonly semantic: readonly MarketingCalibrationMetrics[];
  readonly comparison: MarketingCalibrationComparison;
  readonly caseResults: readonly MarketingSemanticCalibrationCaseResult[];
  readonly baselineCalibration: MarketingCalibrationAgreement;
  readonly semanticCalibration: MarketingCalibrationAgreement;
  readonly preferences: MarketingCalibrationPreferenceSummary;
  readonly modelIdentity: MarketingCalibrationModelIdentity;
  readonly workflow: MarketingCalibrationWorkflowReport;
  readonly enforcement: {
    readonly requested: boolean;
    readonly eligible: boolean;
    readonly enabled: boolean;
    readonly reason: string;
  };
}

export interface MarketingCalibrationCorpusValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
