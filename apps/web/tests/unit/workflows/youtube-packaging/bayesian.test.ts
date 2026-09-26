/**
 * Tests for the packaging swap experiment Bayesian engine (JovieInc/Jovie#10919).
 *
 * Covers:
 * - normCdf: standard normal CDF math (retained for a future validated estimator)
 * - probTreatmentBeatsControl: confidence is unavailable (JOV-6469) — see below
 * - units invariance (JOV-6469): a valid estimator cannot depend on the
 *   arbitrary unit chosen for a continuous measurement like watch duration
 * - checkGuardrails: each guardrail in isolation, including invalid-metrics
 * - selectWinner: no automatic winner is ever declared from unavailable confidence
 */

import { describe, expect, it } from 'vitest';
import {
  checkGuardrails,
  normCdf,
  probTreatmentBeatsControl,
  selectWinner,
} from '@/lib/workflows/youtube-packaging/bayesian';
import type { VariantMetrics } from '@/lib/workflows/youtube-packaging/types';
import {
  MIN_AVD_RATIO,
  MIN_BAYESIAN_CONFIDENCE,
  MIN_HOURS_BETWEEN_SWAPS,
} from '@/lib/workflows/youtube-packaging/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetrics(
  variant: 'control' | 'treatment',
  overrides: Partial<VariantMetrics> = {}
): VariantMetrics {
  return {
    variant,
    impressions: 1000,
    watchMinutes: 800,
    avgViewDurationSeconds: 120,
    windowStart: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    windowEnd: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normCdf
// ---------------------------------------------------------------------------

describe('normCdf', () => {
  it('returns 0.5 for z=0 (symmetric)', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 5);
  });

  it('returns ~0.841 for z=1', () => {
    expect(normCdf(1)).toBeCloseTo(0.8413, 3);
  });

  it('returns ~0.159 for z=-1 (symmetric)', () => {
    expect(normCdf(-1)).toBeCloseTo(0.1587, 3);
  });
});

// ---------------------------------------------------------------------------
// probTreatmentBeatsControl (JOV-6469: confidence unavailable)
// ---------------------------------------------------------------------------

describe('probTreatmentBeatsControl', () => {
  it('returns null when rates are equal (no fabricated 0.5)', () => {
    const a = makeMetrics('control', { impressions: 1000, watchMinutes: 500 });
    const b = makeMetrics('treatment', {
      impressions: 1000,
      watchMinutes: 500,
    });
    expect(probTreatmentBeatsControl(a, b)).toBeNull();
  });

  it('returns null even when treatment appears clearly better with a large sample', () => {
    // Control: 0.5 min/impression; Treatment: 0.7 min/impression; n=2000 each.
    // VariantMetrics carries no per-impression variance, so no statistically
    // valid confidence can be produced regardless of the apparent effect size.
    const a = makeMetrics('control', { impressions: 2000, watchMinutes: 1000 });
    const b = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1400,
    });
    expect(probTreatmentBeatsControl(a, b)).toBeNull();
  });

  it('returns null even when control appears clearly better', () => {
    const a = makeMetrics('control', { impressions: 2000, watchMinutes: 1400 });
    const b = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1000,
    });
    expect(probTreatmentBeatsControl(a, b)).toBeNull();
  });

  it('returns null when either impressions = 0', () => {
    const a = makeMetrics('control', { impressions: 0, watchMinutes: 0 });
    const b = makeMetrics('treatment', {
      impressions: 1000,
      watchMinutes: 500,
    });
    expect(probTreatmentBeatsControl(a, b)).toBeNull();
    expect(probTreatmentBeatsControl(b, a)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Units invariance (JOV-6469) — a valid estimator cannot depend on the
// arbitrary unit chosen for a continuous measurement like watch duration.
// The prior Poisson-rate model scaled its z-score by √c under a c× unit
// rescale (e.g. minutes→seconds, c=60), which could flip the decision kind
// purely from unit choice. These tests fail against that model and pass now
// that the estimator honestly reports "unavailable" instead.
// ---------------------------------------------------------------------------

describe('units invariance (JOV-6469)', () => {
  it('probTreatmentBeatsControl is invariant to rescaling watch-minutes (e.g. minutes vs seconds)', () => {
    const control = makeMetrics('control', {
      impressions: 5000,
      watchMinutes: 500,
    });
    const treatment = makeMetrics('treatment', {
      impressions: 5000,
      watchMinutes: 1000,
    });
    const RESCALE = 60; // simulate expressing the same durations in seconds
    const controlRescaled = {
      ...control,
      watchMinutes: control.watchMinutes * RESCALE,
    };
    const treatmentRescaled = {
      ...treatment,
      watchMinutes: treatment.watchMinutes * RESCALE,
    };

    expect(probTreatmentBeatsControl(control, treatment)).toBe(
      probTreatmentBeatsControl(controlRescaled, treatmentRescaled)
    );
  });

  it('selectWinner reaches the same winner regardless of the watch-time unit scale', () => {
    const control = makeMetrics('control', {
      impressions: 5000,
      watchMinutes: 500,
    });
    const treatment = makeMetrics('treatment', {
      impressions: 5000,
      watchMinutes: 520,
    });
    const RESCALE = 60;
    const controlRescaled = {
      ...control,
      watchMinutes: control.watchMinutes * RESCALE,
    };
    const treatmentRescaled = {
      ...treatment,
      watchMinutes: treatment.watchMinutes * RESCALE,
    };

    const dBase = selectWinner(control, treatment, MIN_BAYESIAN_CONFIDENCE);
    const dRescaled = selectWinner(
      controlRescaled,
      treatmentRescaled,
      MIN_BAYESIAN_CONFIDENCE
    );

    expect(dBase.winner).toBe(dRescaled.winner);
    expect(dBase.confidence).toBe(dRescaled.confidence);
    expect(dBase.winner).toBe('inconclusive');
  });
});

// ---------------------------------------------------------------------------
// checkGuardrails
// ---------------------------------------------------------------------------

describe('checkGuardrails', () => {
  const now = new Date('2024-06-01T12:00:00Z');
  const oldWindow = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(); // 30h ago

  const baseControl = makeMetrics('control', {
    impressions: 600,
    windowStart: oldWindow,
    avgViewDurationSeconds: 120,
  });
  const baseTreatment = makeMetrics('treatment', {
    impressions: 600,
    windowStart: oldWindow,
    avgViewDurationSeconds: 120,
  });

  const baseOpts = {
    minImpressionsPerVariant: 500,
    minExperimentDurationHours: 24,
    lastSwappedAt: null,
    now,
  };

  it('passes when all conditions are met', () => {
    const result = checkGuardrails(baseControl, baseTreatment, baseOpts);
    expect(result.passed).toBe(true);
  });

  it('blocks when control impressions < min', () => {
    const result = checkGuardrails(
      { ...baseControl, impressions: 100 },
      baseTreatment,
      baseOpts
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Control impressions/);
  });

  it('blocks when treatment impressions < min', () => {
    const result = checkGuardrails(
      baseControl,
      { ...baseTreatment, impressions: 100 },
      baseOpts
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Treatment impressions/);
  });

  it('blocks when experiment is too short', () => {
    const recentWindow = new Date(
      now.getTime() - 2 * 60 * 60 * 1000
    ).toISOString(); // only 2h ago
    const result = checkGuardrails(
      baseControl,
      { ...baseTreatment, windowStart: recentWindow },
      baseOpts
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/min/);
  });

  it('blocks on avg-view-duration regression', () => {
    // Treatment AVD is only 90% of control (below MIN_AVD_RATIO = 95%)
    const avdDrop = baseControl.avgViewDurationSeconds * (MIN_AVD_RATIO - 0.1);
    const result = checkGuardrails(
      baseControl,
      { ...baseTreatment, avgViewDurationSeconds: avdDrop },
      baseOpts
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/AVD/);
  });

  it('passes when treatment AVD is exactly at MIN_AVD_RATIO', () => {
    const avdAtThreshold = baseControl.avgViewDurationSeconds * MIN_AVD_RATIO;
    const result = checkGuardrails(
      baseControl,
      { ...baseTreatment, avgViewDurationSeconds: avdAtThreshold },
      baseOpts
    );
    expect(result.passed).toBe(true);
  });

  it('blocks rapid re-swap (within MIN_HOURS_BETWEEN_SWAPS)', () => {
    const recentSwap = new Date(
      now.getTime() - (MIN_HOURS_BETWEEN_SWAPS - 1) * 60 * 60 * 1000
    ).toISOString();
    const result = checkGuardrails(baseControl, baseTreatment, {
      ...baseOpts,
      lastSwappedAt: recentSwap,
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/since last swap/);
  });

  it('allows swap after MIN_HOURS_BETWEEN_SWAPS have passed', () => {
    const oldSwap = new Date(
      now.getTime() - (MIN_HOURS_BETWEEN_SWAPS + 1) * 60 * 60 * 1000
    ).toISOString();
    const result = checkGuardrails(baseControl, baseTreatment, {
      ...baseOpts,
      lastSwappedAt: oldSwap,
    });
    expect(result.passed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Invalid metrics (deliberate-red) — must fail closed, never crash
  // -------------------------------------------------------------------------

  it('blocks on NaN watch minutes instead of crashing', () => {
    const result = checkGuardrails(
      baseControl,
      { ...baseTreatment, watchMinutes: Number.NaN },
      baseOpts
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/NaN|negative|non-finite/);
  });

  it('blocks on negative impressions instead of crashing', () => {
    const result = checkGuardrails(
      { ...baseControl, impressions: -1 },
      baseTreatment,
      baseOpts
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/NaN|negative|non-finite/);
  });

  it('blocks on non-finite avgViewDurationSeconds instead of crashing', () => {
    const result = checkGuardrails(
      baseControl,
      { ...baseTreatment, avgViewDurationSeconds: Number.POSITIVE_INFINITY },
      baseOpts
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/NaN|negative|non-finite/);
  });
});

// ---------------------------------------------------------------------------
// selectWinner (deliberate-red: no unsupported auto-winner)
// ---------------------------------------------------------------------------

describe('selectWinner', () => {
  it('does NOT declare treatment winner even when it appears to clearly outperform control', () => {
    const control = makeMetrics('control', {
      impressions: 2000,
      watchMinutes: 1000,
    });
    const treatment = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1500,
    });
    const decision = selectWinner(control, treatment, MIN_BAYESIAN_CONFIDENCE);
    expect(decision.winner).toBe('inconclusive');
    expect(decision.confidence).toBeNull();
    expect(decision.reason).toMatch(/unavailable/i);
  });

  it('does NOT declare control winner even when treatment appears to clearly underperform', () => {
    const control = makeMetrics('control', {
      impressions: 2000,
      watchMinutes: 1500,
    });
    const treatment = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1000,
    });
    const decision = selectWinner(control, treatment, MIN_BAYESIAN_CONFIDENCE);
    expect(decision.winner).toBe('inconclusive');
    expect(decision.confidence).toBeNull();
  });

  it('returns inconclusive when variants are similar (also confidence-unavailable, not threshold ambiguity)', () => {
    const control = makeMetrics('control', {
      impressions: 600,
      watchMinutes: 500,
    });
    const treatment = makeMetrics('treatment', {
      impressions: 600,
      watchMinutes: 505,
    });
    const decision = selectWinner(control, treatment, MIN_BAYESIAN_CONFIDENCE);
    expect(decision.winner).toBe('inconclusive');
  });

  it('never declares a winner regardless of how permissive the threshold is', () => {
    const control = makeMetrics('control', {
      impressions: 2000,
      watchMinutes: 800,
    });
    const treatment = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 820,
    });
    const dHigh = selectWinner(control, treatment, 0.999);
    const dLow = selectWinner(control, treatment, 0.001);
    // No threshold, however permissive, can produce an automatic winner from
    // an unavailable confidence value.
    expect(dHigh.winner).toBe('inconclusive');
    expect(dLow.winner).toBe('inconclusive');
  });

  it('still includes correct rate metrics in the decision', () => {
    const control = makeMetrics('control', {
      impressions: 1000,
      watchMinutes: 400,
    });
    const treatment = makeMetrics('treatment', {
      impressions: 1000,
      watchMinutes: 800,
    });
    const decision = selectWinner(control, treatment, 0.95);
    expect(decision.controlRate).toBeCloseTo(0.4, 5);
    expect(decision.treatmentRate).toBeCloseTo(0.8, 5);
  });

  it('holds instead of crashing on NaN watch minutes', () => {
    const control = makeMetrics('control');
    const treatment = makeMetrics('treatment', { watchMinutes: Number.NaN });
    const decision = selectWinner(control, treatment, MIN_BAYESIAN_CONFIDENCE);
    expect(decision.winner).toBe('inconclusive');
    expect(decision.confidence).toBeNull();
    expect(Number.isFinite(decision.controlRate)).toBe(true);
    expect(Number.isFinite(decision.treatmentRate)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Constants smoke test — change in defaults surfaces in test output
// ---------------------------------------------------------------------------

describe('guardrail constants', () => {
  it('MIN_AVD_RATIO is between 0.9 and 1.0', () => {
    expect(MIN_AVD_RATIO).toBeGreaterThan(0.9);
    expect(MIN_AVD_RATIO).toBeLessThan(1.0);
  });

  it('MIN_HOURS_BETWEEN_SWAPS >= 24', () => {
    expect(MIN_HOURS_BETWEEN_SWAPS).toBeGreaterThanOrEqual(24);
  });

  it('MIN_BAYESIAN_CONFIDENCE is in (0.9, 1.0)', () => {
    expect(MIN_BAYESIAN_CONFIDENCE).toBeGreaterThan(0.9);
    expect(MIN_BAYESIAN_CONFIDENCE).toBeLessThan(1.0);
  });
});
