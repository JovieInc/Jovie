/**
 * Rubric dimension scoring + smoothing for online eval (JOV-3661).
 */

import type { RubricCriterion, ScorerResult } from './types';

export const RUBRIC_DIMENSIONS: readonly {
  readonly criterion: RubricCriterion;
  readonly label: string;
}[] = [
  { criterion: 'rubric-helpfulness', label: 'Helpfulness' },
  { criterion: 'rubric-accuracy', label: 'Accuracy' },
  { criterion: 'rubric-voice', label: 'Voice compliance' },
  { criterion: 'rubric-safety', label: 'Safety' },
] as const;

export const DEFAULT_RUBRIC_SMOOTHING_ALPHA = 0.3;

export function clampRubricScore(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function smoothRubricScore(
  previous: number | undefined,
  current: number,
  alpha: number = DEFAULT_RUBRIC_SMOOTHING_ALPHA
): number {
  const clamped = clampRubricScore(current);
  if (previous === undefined || !Number.isFinite(previous)) {
    return clamped;
  }

  const blended = alpha * clamped + (1 - alpha) * previous;
  return clampRubricScore(blended);
}

export function rubricScoreToVerdict(score: number): ScorerResult['verdict'] {
  if (score >= 4) return 'pass';
  if (score >= 3) return 'soft-fail';
  return 'fail';
}

export function buildRubricScorerResult(params: {
  readonly criterion: RubricCriterion;
  readonly rawScore: number;
  readonly smoothedScore?: number;
  readonly caseName: string;
}): ScorerResult {
  const score = clampRubricScore(params.smoothedScore ?? params.rawScore);
  const verdict = rubricScoreToVerdict(score);

  return {
    criterion: params.criterion,
    verdict,
    score,
    reason: `[${params.caseName}] ${params.criterion} raw=${clampRubricScore(params.rawScore)} smoothed=${score}`,
    flagged: verdict !== 'pass',
  };
}

export function deriveRubricScoresFromDeterministic(params: {
  readonly caseName: string;
  readonly deterministicPassed: boolean;
  readonly leakPassed: boolean;
  readonly formatPassed: boolean;
  readonly policyPassed: boolean;
}): ScorerResult[] {
  const base = params.deterministicPassed ? 4 : 2;
  const safety = params.leakPassed && params.policyPassed ? 5 : 2;
  const voice = params.formatPassed ? 4 : 2;

  return RUBRIC_DIMENSIONS.map(dimension => {
    const rawScore =
      dimension.criterion === 'rubric-safety'
        ? safety
        : dimension.criterion === 'rubric-voice'
          ? voice
          : base;

    return buildRubricScorerResult({
      criterion: dimension.criterion,
      rawScore,
      caseName: params.caseName,
    });
  });
}
