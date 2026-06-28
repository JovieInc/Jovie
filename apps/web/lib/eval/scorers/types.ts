/**
 * Shared scorer types for CI and online eval lanes (JOV-3661).
 */

import type { FailureMode } from '@/lib/eval/failure-modes';

export const DETERMINISTIC_CRITERIA = [
  'leak-detection',
  'format-policy',
  'policy-adherence',
  'schema-format',
] as const;

export const RUBRIC_CRITERIA = [
  'rubric-helpfulness',
  'rubric-accuracy',
  'rubric-voice',
  'rubric-safety',
] as const;

export const SCORER_CRITERIA = [
  ...DETERMINISTIC_CRITERIA,
  ...RUBRIC_CRITERIA,
] as const;

export type DeterministicCriterion = (typeof DETERMINISTIC_CRITERIA)[number];
export type RubricCriterion = (typeof RUBRIC_CRITERIA)[number];
export type ScorerCriterion = (typeof SCORER_CRITERIA)[number];

export type ScorerVerdict = 'pass' | 'fail' | 'soft-fail';

export interface ScorerResult {
  readonly criterion: ScorerCriterion;
  readonly verdict: ScorerVerdict;
  /** Normalized 0–1 for deterministic scorers; 1–5 for rubric dimensions. */
  readonly score: number;
  readonly reason: string;
  readonly flagged: boolean;
}

export interface ScorerInput {
  readonly caseName: string;
  readonly userPrompt: string;
  readonly assistantResponse: string;
  readonly mustSay?: readonly string[];
  readonly mustNotSay?: readonly string[];
  readonly harmfulBlacklist?: readonly string[];
  readonly voiceException?: boolean;
  readonly mustRefuse?: boolean;
  readonly mustNotLeakPrompt?: boolean;
}

export interface DeterministicScorerBundle {
  readonly results: readonly ScorerResult[];
  readonly passed: boolean;
  readonly flagged: boolean;
  readonly failureModes: readonly FailureMode[];
}

export type TimeSeriesGranularity = 'hourly' | 'six-hourly' | 'daily';

export interface ScoreObservation {
  readonly criterion: ScorerCriterion;
  readonly score: number;
  readonly timestamp: string;
  readonly traceId: string;
}

export interface ScoreTimeSeriesBucket {
  readonly granularity: TimeSeriesGranularity;
  readonly bucketStart: string;
  readonly criterion: ScorerCriterion;
  readonly count: number;
  readonly mean: number;
  readonly smoothedMean: number;
}

export interface ScoreAnomaly {
  readonly criterion: ScorerCriterion;
  readonly granularity: TimeSeriesGranularity;
  readonly bucketStart: string;
  readonly currentMean: number;
  readonly baselineMean: number;
  readonly consecutiveBuckets: number;
}

export interface ProdTraceSampleInput {
  readonly traceId: string;
  readonly durationMs?: number;
  readonly tokenCount?: number;
  readonly plan?: string;
}

export interface OnlineScoringInput extends ScorerInput {
  readonly traceId: string;
  readonly durationMs?: number;
  readonly tokenCount?: number;
  readonly plan?: string;
  readonly rubricScores?: Partial<Record<RubricCriterion, number>>;
}

export interface OnlineScoringResult {
  readonly sampled: boolean;
  readonly results: readonly ScorerResult[];
  readonly flagged: boolean;
  readonly failureModes: readonly FailureMode[];
  readonly reviewEnqueued: boolean;
  readonly anomalies: readonly ScoreAnomaly[];
}
