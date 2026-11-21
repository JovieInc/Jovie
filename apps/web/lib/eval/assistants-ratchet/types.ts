/** Assistants CI ratchet types. */
export const ASSISTANTS_RATCHET_SCHEMA_VERSION = 1 as const;
export const ASSISTANTS_RUBRIC_VERSION = 'assistants-v1' as const;
export type AssistantId = 'jovie' | 'summer';
export type BaselineRecordStatus = 'unrun' | 'recorded';
export type SampleMode = 'pr' | 'nightly';
export type SampleSource = 'fixture' | 'live' | 'cache';
export interface AssistantBaseline {
  readonly status: BaselineRecordStatus;
  readonly median: number | null;
  readonly nCases: number | null;
  readonly safetyPassRate: number | null;
  readonly inventedFacts: number | null;
  readonly oneRecommendationRate: number | null;
  readonly notes?: string;
}
export interface JankBaseline {
  readonly status: 'green' | 'regressed';
  readonly contractTests: readonly string[];
}
export interface JudgeCacheSpec {
  readonly keyShape: readonly string[];
  readonly notes?: string;
}
export interface BaselineMedians {
  readonly schemaVersion: typeof ASSISTANTS_RATCHET_SCHEMA_VERSION;
  readonly rubricVersion: string;
  readonly scale: { readonly min: number; readonly max: number; readonly targetMedian: number };
  readonly updatedAt: string | null;
  readonly assistants: Readonly<Record<AssistantId, AssistantBaseline>>;
  readonly jank: JankBaseline;
  readonly judgeCache?: JudgeCacheSpec;
}
export interface SafetySample {
  readonly passed: number;
  readonly failed: number;
  readonly failedIds: readonly string[];
}
export interface JankSample {
  readonly passed: boolean;
  readonly regressions?: readonly string[];
}
export interface EvalSample {
  readonly assistant: AssistantId;
  readonly mode: SampleMode;
  readonly source: SampleSource;
  readonly rubricVersion: string;
  readonly median: number;
  readonly caseScores?: readonly number[];
  readonly nCases: number;
  readonly safety: SafetySample;
  readonly inventedFacts: number;
  readonly jank: JankSample;
  readonly budgetExhausted?: boolean;
}
export type RatchetFailReason =
  | 'safety_failed'
  | 'invented_facts'
  | 'jank_regressed'
  | 'median_drop'
  | 'rubric_mismatch'
  | 'invalid_sample';
export interface RatchetFailure {
  readonly reason: RatchetFailReason;
  readonly message: string;
}
export interface RatchetVerdict {
  readonly ok: boolean;
  readonly failures: readonly RatchetFailure[];
  readonly notices: readonly string[];
  readonly assistant: AssistantId;
  readonly baselineStatus: BaselineRecordStatus;
  readonly recordedMedian: number | null;
  readonly sampleMedian: number;
}
