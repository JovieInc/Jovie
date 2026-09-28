/**
 * Bayesian winner detection for packaging swap experiments (JovieInc/Jovie#10919).
 *
 * JOV-6469 finding: the Poisson-Gamma model this module used to run treated
 * `watchMinutes` — a continuous, aggregated duration total — as if it were a
 * Poisson event count (Var[rate] = rate / impressions). That assumption is
 * invalid for a continuous outcome and is not unit invariant: expressing the
 * same underlying watch time in seconds instead of minutes rescales the
 * implied variance and changes the resulting confidence (see
 * bayesian.test.ts, "units invariance"). A valid test of the difference
 * between two continuous-duration means requires the per-observation
 * variance of watch time, which `VariantMetrics` does not carry (only the
 * aggregate total and the mean). The sample mean alone is consistent with
 * any true variance from zero to unbounded, so no statistically valid
 * confidence can be derived from this contract today.
 *
 * `probTreatmentBeatsControl` therefore always returns `null` ("insufficient
 * evidence"), and `selectWinner` always holds at 'inconclusive' — retaining
 * control rather than fabricating a winner — until the metrics contract
 * carries the missing moment (e.g. sum of squared per-view durations).
 *
 * Guardrails applied before Bayesian eval (unaffected by the above):
 *   1. min impressions per variant
 *   2. min experiment wall-clock duration
 *   3. avg-view-duration regression (AVD of treatment >= 95% of control)
 *   4. anti-rapid-reswap (MIN_HOURS_BETWEEN_SWAPS since last swap)
 */

import type { VariantMetrics } from './types';
import { MIN_AVD_RATIO, MIN_HOURS_BETWEEN_SWAPS } from './types';

// ---------------------------------------------------------------------------
// Core Bayesian probability P(λ_B > λ_A)
// ---------------------------------------------------------------------------

/**
 * Attempts to return the posterior probability that the treatment rate
 * (λ_B) exceeds the control rate (λ_A), i.e. P(λ_B > λ_A).
 *
 * Always returns `null` today: `VariantMetrics` carries only aggregate
 * watch minutes and their mean, never the per-observation variance a valid
 * continuous-duration comparison requires (JOV-6469). Callers must treat
 * `null` as "insufficient evidence" and hold at 'inconclusive' rather than
 * substitute a guess. This still validates its inputs so obviously-corrupt
 * data can never slip through once a real estimator is implemented here.
 */
export function probTreatmentBeatsControl(
  control: Pick<VariantMetrics, 'impressions' | 'watchMinutes'>,
  treatment: Pick<VariantMetrics, 'impressions' | 'watchMinutes'>
): number | null {
  if (
    !Number.isFinite(control.impressions) ||
    !Number.isFinite(control.watchMinutes) ||
    !Number.isFinite(treatment.impressions) ||
    !Number.isFinite(treatment.watchMinutes) ||
    control.impressions < 0 ||
    treatment.impressions < 0
  ) {
    return null;
  }

  // ponytail: unconditional until VariantMetrics carries an observed
  // watch-time variance/second-moment field (JOV-6469) — see module doc.
  return null;
}

// ---------------------------------------------------------------------------
// Guardrail checks
// ---------------------------------------------------------------------------

export interface GuardrailResult {
  readonly passed: boolean;
  readonly reason: string;
}

/**
 * Checks all pre-winner-declaration guardrails.
 * Returns the first failing guardrail, or {passed: true} if all pass.
 */
export function checkGuardrails(
  control: VariantMetrics,
  treatment: VariantMetrics,
  opts: {
    readonly minImpressionsPerVariant: number;
    readonly minExperimentDurationHours: number;
    readonly lastSwappedAt: string | null;
    readonly now?: Date;
  }
): GuardrailResult {
  const now = opts.now ?? new Date();

  // 1. Minimum impressions
  if (control.impressions < opts.minImpressionsPerVariant) {
    return {
      passed: false,
      reason: `Control impressions ${control.impressions} < min ${opts.minImpressionsPerVariant}`,
    };
  }
  if (treatment.impressions < opts.minImpressionsPerVariant) {
    return {
      passed: false,
      reason: `Treatment impressions ${treatment.impressions} < min ${opts.minImpressionsPerVariant}`,
    };
  }

  // 2. Minimum wall-clock duration (treatment window must be old enough)
  const windowStart = new Date(treatment.windowStart);
  const elapsedHours =
    (now.getTime() - windowStart.getTime()) / (1000 * 60 * 60);
  if (elapsedHours < opts.minExperimentDurationHours) {
    return {
      passed: false,
      reason: `Experiment only ${elapsedHours.toFixed(1)}h old; min ${opts.minExperimentDurationHours}h`,
    };
  }

  // 3. Avg-view-duration regression guard
  if (
    control.avgViewDurationSeconds > 0 &&
    treatment.avgViewDurationSeconds <
      control.avgViewDurationSeconds * MIN_AVD_RATIO
  ) {
    return {
      passed: false,
      reason: `Treatment AVD ${treatment.avgViewDurationSeconds.toFixed(0)}s < ${(MIN_AVD_RATIO * 100).toFixed(0)}% of control ${control.avgViewDurationSeconds.toFixed(0)}s`,
    };
  }

  // 4. Anti-rapid-reswap guard
  if (opts.lastSwappedAt) {
    const hoursSinceSwap =
      (now.getTime() - new Date(opts.lastSwappedAt).getTime()) /
      (1000 * 60 * 60);
    if (hoursSinceSwap < MIN_HOURS_BETWEEN_SWAPS) {
      return {
        passed: false,
        reason: `Only ${hoursSinceSwap.toFixed(1)}h since last swap; min ${MIN_HOURS_BETWEEN_SWAPS}h`,
      };
    }
  }

  return { passed: true, reason: 'all guardrails passed' };
}

// ---------------------------------------------------------------------------
// Winner selection
// ---------------------------------------------------------------------------

export type WinnerOutcome = 'treatment' | 'control' | 'inconclusive';

export interface WinnerDecision {
  readonly winner: WinnerOutcome;
  /** Posterior P(treatment > control), or null when no valid estimate exists. */
  readonly confidence: number | null;
  readonly controlRate: number;
  readonly treatmentRate: number;
  readonly reason: string;
}

/**
 * Evaluates the experiment and returns a winner decision.
 *
 * Must only be called after checkGuardrails() returns passed = true.
 *
 * JOV-6469: `probTreatmentBeatsControl` always returns `null` today (no
 * valid confidence can be derived from the current VariantMetrics
 * contract), so this always holds at 'inconclusive' — retaining control —
 * rather than declare a winner off an unsupported estimate. The
 * threshold-based branches below are kept so a future validated estimator
 * can plug in without changing this function's contract.
 */
export function selectWinner(
  control: VariantMetrics,
  treatment: VariantMetrics,
  minBayesianConfidence: number
): WinnerDecision {
  const confidence = probTreatmentBeatsControl(control, treatment);
  const controlRate = control.watchMinutes / control.impressions;
  const treatmentRate = treatment.watchMinutes / treatment.impressions;

  if (confidence === null) {
    return {
      winner: 'inconclusive',
      confidence: null,
      controlRate,
      treatmentRate,
      reason:
        'Inconclusive: no statistically valid confidence available (VariantMetrics carries no observed watch-time variance) — retaining control',
    };
  }

  if (confidence >= minBayesianConfidence) {
    return {
      winner: 'treatment',
      confidence,
      controlRate,
      treatmentRate,
      reason: `Treatment wins: P(B>A)=${confidence.toFixed(3)} >= threshold ${minBayesianConfidence}`,
    };
  }

  // ponytail: check if control clearly beats treatment (1 - confidence >= threshold)
  const controlConf = 1 - confidence;
  if (controlConf >= minBayesianConfidence) {
    return {
      winner: 'control',
      confidence,
      controlRate,
      treatmentRate,
      reason: `Control wins: P(A>B)=${controlConf.toFixed(3)} >= threshold ${minBayesianConfidence}`,
    };
  }

  return {
    winner: 'inconclusive',
    confidence,
    controlRate,
    treatmentRate,
    reason: `Inconclusive: P(B>A)=${confidence.toFixed(3)}, below threshold ${minBayesianConfidence} in both directions`,
  };
}
