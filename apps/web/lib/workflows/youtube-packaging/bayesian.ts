/**
 * Bayesian winner detection for packaging swap experiments (JovieInc/Jovie#10919).
 *
 * Model: Poisson-Gamma conjugate over watch_minutes_per_impression.
 *   - Prior: Gamma(1, 0) = improper flat prior on rate
 *   - Posterior A: Gamma(watchMinA + 1, impressA)
 *   - Posterior B: Gamma(watchMinB + 1, impressB)
 *
 * P(λ_B > λ_A) derived via the normal approximation to the Poisson rate
 * difference, which is accurate for impressions >= 100 and exact in the
 * limit. At the issue's MIN_IMPRESSIONS_PER_VARIANT = 500 this is tight.
 *
 * Guardrails applied before Bayesian eval:
 *   1. min impressions per variant
 *   2. min experiment wall-clock duration
 *   3. avg-view-duration regression (AVD of treatment >= 95% of control)
 *   4. anti-rapid-reswap (MIN_HOURS_BETWEEN_SWAPS since last swap)
 */

import type { VariantMetrics } from './types';
import { MIN_AVD_RATIO, MIN_HOURS_BETWEEN_SWAPS } from './types';

// ---------------------------------------------------------------------------
// Normal CDF approximation (for P(z) where z is standard normal)
// Abramowitz & Stegun 26.2.17 — max error 7.5e-8.
// ---------------------------------------------------------------------------

function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

// ---------------------------------------------------------------------------
// Core Bayesian probability P(λ_B > λ_A)
// ---------------------------------------------------------------------------

/**
 * Returns the posterior probability that the treatment rate (λ_B) exceeds
 * the control rate (λ_A), i.e. P(λ_B > λ_A).
 *
 * Uses the normal approximation to the difference of Poisson rates,
 * which is accurate when both variants have at least ~100 impressions.
 *
 * Returns 0.5 (no information) when either variant has zero impressions.
 */
export function probTreatmentBeatsControl(
  control: Pick<VariantMetrics, 'impressions' | 'watchMinutes'>,
  treatment: Pick<VariantMetrics, 'impressions' | 'watchMinutes'>
): number {
  if (control.impressions === 0 || treatment.impressions === 0) return 0.5;

  // MLE rate estimates
  const rateA = control.watchMinutes / control.impressions;
  const rateB = treatment.watchMinutes / treatment.impressions;

  // Poisson variance: Var[rate] = rate / n
  const varA = rateA / control.impressions;
  const varB = rateB / treatment.impressions;
  const se = Math.sqrt(varA + varB);

  if (se === 0) {
    // Both rates identical — 0.5 by symmetry
    return 0.5;
  }

  // z-score for H0: rateB - rateA <= 0
  const z = (rateB - rateA) / se;
  return normCdf(z);
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
  /** Posterior P(treatment > control). */
  readonly confidence: number;
  readonly controlRate: number;
  readonly treatmentRate: number;
  readonly reason: string;
}

/**
 * Evaluates the experiment and returns a winner decision.
 *
 * Must only be called after checkGuardrails() returns passed = true.
 */
export function selectWinner(
  control: VariantMetrics,
  treatment: VariantMetrics,
  minBayesianConfidence: number
): WinnerDecision {
  const confidence = probTreatmentBeatsControl(control, treatment);
  const controlRate = control.watchMinutes / control.impressions;
  const treatmentRate = treatment.watchMinutes / treatment.impressions;

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
