/**
 * Tests for the packaging swap experiment Bayesian engine (JovieInc/Jovie#10919).
 *
 * Covers:
 * - probTreatmentBeatsControl: core statistical property (symmetry, monotonicity)
 * - checkGuardrails: each guardrail in isolation
 * - selectWinner: correct outcome classification
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
  it('returns 0.5 when rates are equal', () => {
    const a = makeMetrics('control', { impressions: 1000, watchMinutes: 500 });
    const b = makeMetrics('treatment', {
      impressions: 1000,
      watchMinutes: 500,
    });
    const p = probTreatmentBeatsControl(a, b);
    expect(p).toBeCloseTo(0.5, 1);
  });

  it('returns > 0.95 when treatment is clearly better with large sample', () => {
    // Control: 0.5 min/impression; Treatment: 0.7 min/impression; n=2000 each
    const a = makeMetrics('control', { impressions: 2000, watchMinutes: 1000 });
    const b = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1400,
    });
    const p = probTreatmentBeatsControl(a, b);
    expect(p).toBeGreaterThan(0.95);
  });

  it('returns < 0.05 when control is clearly better', () => {
    const a = makeMetrics('control', { impressions: 2000, watchMinutes: 1400 });
    const b = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1000,
    });
    const p = probTreatmentBeatsControl(a, b);
    expect(p).toBeLessThan(0.05);
  });

  it('is symmetric (P(B>A) = 1 - P(A>B))', () => {
    const a = makeMetrics('control', { impressions: 1500, watchMinutes: 900 });
    const b = makeMetrics('treatment', {
      impressions: 1500,
      watchMinutes: 1050,
    });
    const pBA = probTreatmentBeatsControl(a, b);
    const pAB = probTreatmentBeatsControl(b, a);
    expect(pBA + pAB).toBeCloseTo(1.0, 5);
  });

  it('returns 0.5 when either impressions = 0', () => {
    const a = makeMetrics('control', { impressions: 0, watchMinutes: 0 });
    const b = makeMetrics('treatment', {
      impressions: 1000,
      watchMinutes: 500,
    });
    expect(probTreatmentBeatsControl(a, b)).toBe(0.5);
    expect(probTreatmentBeatsControl(b, a)).toBe(0.5);
  });

  it('probability increases monotonically as treatment rate improves', () => {
    const control = makeMetrics('control', {
      impressions: 1000,
      watchMinutes: 500,
    });
    const rates = [0.45, 0.5, 0.55, 0.6, 0.65].map(r =>
      probTreatmentBeatsControl(
        control,
        makeMetrics('treatment', {
          impressions: 1000,
          watchMinutes: Math.round(r * 1000),
        })
      )
    );
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
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
  it('declares treatment winner when confidence >= threshold', () => {
    // Treatment is clearly better — P(B>A) will be very high
    const control = makeMetrics('control', {
      impressions: 2000,
      watchMinutes: 1000,
    });
    const treatment = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1500,
    });
    const decision = selectWinner(control, treatment, MIN_BAYESIAN_CONFIDENCE);
    expect(decision.winner).toBe('treatment');
    expect(decision.confidence).toBeGreaterThanOrEqual(MIN_BAYESIAN_CONFIDENCE);
  });

  it('declares control winner when P(A>B) >= threshold', () => {
    const control = makeMetrics('control', {
      impressions: 2000,
      watchMinutes: 1500,
    });
    const treatment = makeMetrics('treatment', {
      impressions: 2000,
      watchMinutes: 1000,
    });
    const decision = selectWinner(control, treatment, MIN_BAYESIAN_CONFIDENCE);
    expect(decision.winner).toBe('control');
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
