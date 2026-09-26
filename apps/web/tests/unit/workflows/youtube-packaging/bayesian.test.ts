/**
 * Tests for the packaging swap experiment Bayesian engine (JovieInc/Jovie#10919).
 *
 * Covers:
 * - probTreatmentBeatsControl: always insufficient-evidence (JOV-6469), input validation, units invariance
 * - checkGuardrails: each guardrail in isolation
 * - selectWinner: correct outcome classification (always holds at 'inconclusive' today)
 */

import { describe, expect, it } from 'vitest';
import {
  checkGuardrails,
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
// probTreatmentBeatsControl
// ---------------------------------------------------------------------------

describe('probTreatmentBeatsControl', () => {
  it('returns null (insufficient evidence) even when rates are equal', () => {
    const a = makeMetrics('control', { impressions: 1000, watchMinutes: 500 });
    const b = makeMetrics('treatment', {
      impressions: 1000,
      watchMinutes: 500,
    });
    expect(probTreatmentBeatsControl(a, b)).toBeNull();
  });

  it('returns null even when treatment is clearly better with a large sample (JOV-6469: reject unsupported high confidence)', () => {
    // Control: 0.5 min/impression; Treatment: 0.7 min/impression; n=2000 each
    const a = makeMetrics('control', { impressions: 2000, watchMinutes: 1000 });
    const b = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1400,
    });
    expect(probTreatmentBeatsControl(a, b)).toBeNull();
  });

  it('returns null even when control is clearly better', () => {
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

  it('returns null for NaN, negative, or non-finite inputs (red test: never fabricate a confidence from corrupt data)', () => {
    const good = makeMetrics('treatment', {
      impressions: 1000,
      watchMinutes: 500,
    });
    expect(
      probTreatmentBeatsControl(
        makeMetrics('control', { impressions: Number.NaN, watchMinutes: 100 }),
        good
      )
    ).toBeNull();
    expect(
      probTreatmentBeatsControl(
        makeMetrics('control', { impressions: -5, watchMinutes: 100 }),
        good
      )
    ).toBeNull();
    expect(
      probTreatmentBeatsControl(
        makeMetrics('control', {
          impressions: 100,
          watchMinutes: Number.POSITIVE_INFINITY,
        }),
        good
      )
    ).toBeNull();
  });

  it('is invariant to whether watch time is expressed in minutes or seconds (JOV-6469 units-invariance)', () => {
    const controlMin = makeMetrics('control', {
      impressions: 2000,
      watchMinutes: 1000,
    });
    const treatmentMin = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1400,
    });
    // Same underlying observations, watch time mislabeled/expressed in seconds.
    const controlSec = {
      ...controlMin,
      watchMinutes: controlMin.watchMinutes * 60,
    };
    const treatmentSec = {
      ...treatmentMin,
      watchMinutes: treatmentMin.watchMinutes * 60,
    };

    expect(probTreatmentBeatsControl(controlMin, treatmentMin)).toBe(
      probTreatmentBeatsControl(controlSec, treatmentSec)
    );
  });

  it('documents why the retired Poisson-rate approximation was NOT unit invariant', () => {
    // Historical bug (JOV-6469): the module used to model the continuous,
    // aggregate watch-minutes total as if it were a Poisson event count
    // (Var[rate] = rate / impressions). Re-deriving that retired formula
    // here proves the same underlying observations, read in different but
    // consistent time units, produced different z-scores (and therefore
    // different confidence) purely from the arbitrary unit choice.
    const rate = (m: { watchMinutes: number; impressions: number }) =>
      m.watchMinutes / m.impressions;
    const retiredZ = (
      a: { watchMinutes: number; impressions: number },
      b: { watchMinutes: number; impressions: number }
    ) => {
      const rateA = rate(a);
      const rateB = rate(b);
      const se = Math.sqrt(rateA / a.impressions + rateB / b.impressions);
      return (rateB - rateA) / se;
    };
    const controlMin = { impressions: 2000, watchMinutes: 1000 };
    const treatmentMin = { impressions: 2000, watchMinutes: 1400 };
    const controlSec = { impressions: 2000, watchMinutes: 1000 * 60 };
    const treatmentSec = { impressions: 2000, watchMinutes: 1400 * 60 };

    const zMin = retiredZ(controlMin, treatmentMin);
    const zSec = retiredZ(controlSec, treatmentSec);

    // Same relative lift, same impressions — but the retired formula's
    // z-score scaled by sqrt(60) purely from expressing duration in
    // seconds instead of minutes. This non-invariance is exactly the bug
    // JOV-6469 exists to fix; the current estimator sidesteps it by never
    // computing a confidence from this data at all (see tests above).
    expect(zSec / zMin).toBeCloseTo(Math.sqrt(60), 5);
    expect(zMin).not.toBeCloseTo(zSec, 1);
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
});

// ---------------------------------------------------------------------------
// selectWinner
// ---------------------------------------------------------------------------

describe('selectWinner', () => {
  it('holds at inconclusive (retains control) even when treatment is clearly better (JOV-6469: no validated estimator exists yet)', () => {
    // Treatment is clearly better by the raw rate — but VariantMetrics
    // carries no watch-time variance, so no confidence can be validated.
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
    expect(decision.reason).toMatch(/insufficient|no statistically valid/i);
  });

  it('holds at inconclusive even when control is clearly better', () => {
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

  it('returns inconclusive when neither variant clears threshold', () => {
    // Very similar rates — no clear winner
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

  it('includes correct rate metrics in the decision', () => {
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
