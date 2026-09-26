/**
 * Bayesian winner detection for packaging swap experiments (JovieInc/Jovie#10919).
 *
 * Confidence currently unavailable — see JOV-6469. The prior model treated
 * aggregate watch minutes as a Poisson rate (Var[rate] = rate / impressions),
 * i.e. it modeled a continuous duration as a count of discrete unit-rate
 * events. That model is not invariant to the arbitrary unit chosen for the
 * duration: rescaling the same underlying observation from minutes to
 * seconds (×60) scales the resulting z-score by √60, which can flip a
 * `continue` decision into a declared winner purely from unit choice (see
 * the "units invariance" tests in bayesian.test.ts). A statistically valid
 * estimator needs the variance of per-impression watch time, which
 * `VariantMetrics` does not carry (only aggregate impressions, aggregate
 * watch minutes, and average view duration). Until that moment is
 * available, `probTreatmentBeatsControl` returns `null` and callers MUST
 * retain control (`inconclusive`) rather than substitute a guess — the
 * previous 0.5 "no information" sentinel looked like a valid probability
 * but wasn't.
 *
 * Guardrails applied before Bayesian eval (unaffected by the above):
 *   1. min impressions per variant
 *   2. min experiment wall-clock duration
 *   3. avg-view-duration regression (AVD of treatment >= 95% of control)
 *   4. anti-rapid-reswap (MIN_HOURS_BETWEEN_SWAPS since last swap)
 *   5. invalid metrics (NaN / negative / non-finite) — fail closed
 */

import type { VariantMetrics } from './types';
import { MIN_AVD_RATIO, MIN_HOURS_BETWEEN_SWAPS } from './types';

// ---------------------------------------------------------------------------
// Normal CDF approximation (for P(z) where z is standard normal)
// Abramowitz & Stegun 26.2.17 — max error 7.5e-8.
// Retained (exported + unit-tested) for a future validated estimator; not
// currently called since probTreatmentBeatsControl always returns null.
// ---------------------------------------------------------------------------

export function normCdf(z: number): number {
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
 * the control rate (λ_A), i.e. P(λ_B > λ_A) — or `null` when no
 * statistically valid estimate can be produced.
 *
 * See the module doc comment (JOV-6469): the current `VariantMetrics`
 * contract carries no per-impression variance, so this always returns
 * `null`. Kept as a real function (not deleted) so a future validated
 * estimator can slot in without a decision-framework rewrite.
 */
export function probTreatmentBeatsControl(
  _control: Pick<VariantMetrics, 'impressions' | 'watchMinutes'>,
  _treatment: Pick<VariantMetrics, 'impressions' | 'watchMinutes'>
): number | null {
  return null;
}

/** True when a variant's metrics are safe to use in arithmetic (finite, non-negative). */
function isValidVariantMetrics(m: VariantMetrics): boolean {
  return (
    Number.isFinite(m.impressions) &&
    m.impressions >= 0 &&
    Number.isFinite(m.watchMinutes) &&
    m.watchMinutes >= 0 &&
    Number.isFinite(m.avgViewDurationSeconds) &&
    m.avgViewDurationSeconds >= 0
  );
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

  // 0. Invalid metrics (NaN / negative / non-finite) — fail closed before any
  // arithmetic uses them, rather than silently propagating NaN into rates,
  // guardrail comparisons, or the decision log.
  if (!isValidVariantMetrics(control) || !isValidVariantMetrics(treatment)) {
    return {
      passed: false,
      reason:
        'Control or treatment metrics contain NaN, negative, or non-finite values; holding until valid data is available.',
    };
  }

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
  /** Posterior P(treatment > control), or `null` when unavailable (see JOV-6469). */
  readonly confidence: number | null;
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
  if (!isValidVariantMetrics(control) || !isValidVariantMetrics(treatment)) {
    return {
      winner: 'inconclusive',
      confidence: null,
      controlRate: 0,
      treatmentRate: 0,
      reason:
        'Invalid metrics (NaN, negative, or non-finite); holding until valid data is available.',
    };
  }

  const confidence = probTreatmentBeatsControl(control, treatment);
  const controlRate = control.watchMinutes / control.impressions;
  const treatmentRate = treatment.watchMinutes / treatment.impressions;

  // Confidence unavailable: the estimator can't be statistically validated
  // against the current metrics contract (see probTreatmentBeatsControl).
  // Retain control instead of guessing — no automatic winner without evidence.
  if (confidence === null) {
    return {
      winner: 'inconclusive',
      confidence: null,
      controlRate,
      treatmentRate,
      reason:
        'Confidence unavailable: win-probability requires per-impression watch-time variance, which the current metrics contract does not provide. No automatic winner without a validated estimator.',
    };
  }

  // Below is currently unreachable (probTreatmentBeatsControl always returns
  // null above); kept so a future validated estimator only needs to return a
  // real number to re-enable automatic decisions — no rewrite needed here.
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
