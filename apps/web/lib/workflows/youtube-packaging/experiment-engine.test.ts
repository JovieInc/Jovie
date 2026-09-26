import { describe, expect, it } from 'vitest';
import {
  buildDecisionLogEntry,
  computeBayesianProbBOverA,
  DEFAULT_LOSE_THRESHOLD,
  DEFAULT_MIN_IMPRESSIONS,
  DEFAULT_WIN_THRESHOLD,
  type ExperimentState,
  evaluatePackagingExperiment,
  normalCdf,
  type VariantMetrics,
  watchMinutesPerImpression,
  YOUTUBE_PACKAGING_EXPERIMENT_KIND,
} from './experiment-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_NOW = '2026-07-01T12:00:00.000Z';
/** 4 days before BASE_NOW — satisfies the default 72 h min-duration. */
const STARTED_4D_AGO = '2026-06-27T12:00:00.000Z';

function makeState(overrides: Partial<ExperimentState> = {}): ExperimentState {
  return {
    experimentId: '00000000-0000-0000-0000-000000000001',
    videoId: 'dQw4w9WgXcQ',
    channelId: 'UCxxxxxx',
    startedAt: STARTED_4D_AGO,
    lastSwapAt: null,
    control: {
      impressions: 1000,
      watchMinutes: 500,
      avgViewDurationSeconds: 180,
    },
    treatment: {
      impressions: 1000,
      watchMinutes: 600,
      avgViewDurationSeconds: 185,
    },
    autoPublishEnabled: true,
    nowIso: BASE_NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalCdf
// ---------------------------------------------------------------------------

describe('normalCdf', () => {
  it('returns 0.5 for z=0 (symmetric)', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
  });

  it('returns ~0.841 for z=1', () => {
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
  });

  it('returns ~0.159 for z=-1 (symmetric)', () => {
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it('returns near 1 for large positive z', () => {
    expect(normalCdf(4)).toBeGreaterThan(0.999);
  });

  it('returns near 0 for large negative z', () => {
    expect(normalCdf(-4)).toBeLessThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// watchMinutesPerImpression
// ---------------------------------------------------------------------------

describe('watchMinutesPerImpression', () => {
  it('divides correctly', () => {
    const m: VariantMetrics = {
      impressions: 200,
      watchMinutes: 100,
      avgViewDurationSeconds: 30,
    };
    expect(watchMinutesPerImpression(m)).toBeCloseTo(0.5, 6);
  });

  it('returns 0 when impressions = 0 (no divide-by-zero)', () => {
    const m: VariantMetrics = {
      impressions: 0,
      watchMinutes: 0,
      avgViewDurationSeconds: 0,
    };
    expect(watchMinutesPerImpression(m)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeBayesianProbBOverA
// ---------------------------------------------------------------------------

describe('computeBayesianProbBOverA', () => {
  it('returns null when control has zero impressions (no valid estimate, not a guessed 0.5)', () => {
    const noData: VariantMetrics = {
      impressions: 0,
      watchMinutes: 0,
      avgViewDurationSeconds: 0,
    };
    const good: VariantMetrics = {
      impressions: 1000,
      watchMinutes: 500,
      avgViewDurationSeconds: 180,
    };
    expect(computeBayesianProbBOverA(noData, good)).toBeNull();
  });

  it('returns null when treatment strongly outperforms control (confidence unavailable, not a guessed high probability)', () => {
    const control: VariantMetrics = {
      impressions: 5000,
      watchMinutes: 500,
      avgViewDurationSeconds: 180,
    };
    // Treatment has 2× watch-min/impression — but VariantMetrics carries no
    // variance, so no statistically valid confidence can be produced.
    const treatment: VariantMetrics = {
      impressions: 5000,
      watchMinutes: 1000,
      avgViewDurationSeconds: 200,
    };
    expect(computeBayesianProbBOverA(control, treatment)).toBeNull();
  });

  it('returns null when treatment strongly underperforms control', () => {
    const control: VariantMetrics = {
      impressions: 5000,
      watchMinutes: 1000,
      avgViewDurationSeconds: 200,
    };
    const treatment: VariantMetrics = {
      impressions: 5000,
      watchMinutes: 500,
      avgViewDurationSeconds: 160,
    };
    expect(computeBayesianProbBOverA(control, treatment)).toBeNull();
  });

  it('returns null when variants are equal', () => {
    const m: VariantMetrics = {
      impressions: 2000,
      watchMinutes: 800,
      avgViewDurationSeconds: 180,
    };
    expect(computeBayesianProbBOverA(m, m)).toBeNull();
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
  it('computeBayesianProbBOverA is invariant to rescaling watch-minutes (e.g. minutes vs seconds)', () => {
    const control: VariantMetrics = {
      impressions: 5000,
      watchMinutes: 500,
      avgViewDurationSeconds: 180,
    };
    const treatment: VariantMetrics = {
      impressions: 5000,
      watchMinutes: 1000,
      avgViewDurationSeconds: 200,
    };
    const RESCALE = 60; // simulate expressing the same durations in seconds
    const controlRescaled: VariantMetrics = {
      ...control,
      watchMinutes: control.watchMinutes * RESCALE,
    };
    const treatmentRescaled: VariantMetrics = {
      ...treatment,
      watchMinutes: treatment.watchMinutes * RESCALE,
    };

    expect(computeBayesianProbBOverA(control, treatment)).toBe(
      computeBayesianProbBOverA(controlRescaled, treatmentRescaled)
    );
  });

  it('evaluatePackagingExperiment reaches the same decision kind regardless of the watch-time unit scale', () => {
    const state = makeState({
      control: {
        impressions: 5000,
        watchMinutes: 500,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 5000,
        watchMinutes: 520,
        avgViewDurationSeconds: 181,
      },
    });
    const RESCALE = 60;
    const rescaledState = makeState({
      control: {
        ...state.control,
        watchMinutes: state.control.watchMinutes * RESCALE,
      },
      treatment: {
        ...state.treatment,
        watchMinutes: state.treatment.watchMinutes * RESCALE,
      },
    });

    const dBase = evaluatePackagingExperiment(state);
    const dRescaled = evaluatePackagingExperiment(rescaledState);

    expect(dBase.kind).toBe(dRescaled.kind);
    expect(dBase.probTreatmentWins).toBe(dRescaled.probTreatmentWins);
    expect(dBase.kind).not.toBe('swap_treatment');
    expect(dBase.kind).not.toBe('rollback_control');
  });
});

// ---------------------------------------------------------------------------
// evaluatePackagingExperiment — guardrails
// ---------------------------------------------------------------------------

describe('evaluatePackagingExperiment — guardrails', () => {
  it('returns continue when impressions < minimum', () => {
    const state = makeState({
      control: {
        impressions: 100,
        watchMinutes: 50,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 100,
        watchMinutes: 60,
        avgViewDurationSeconds: 185,
      },
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('continue');
    expect(d.guardrailViolations.some(v => v.rule === 'min_impressions')).toBe(
      true
    );
  });

  it('returns continue when test window < min duration', () => {
    const state = makeState({
      // Started only 1 h ago — under 72 h minimum
      startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      nowIso: BASE_NOW,
      control: {
        impressions: 2000,
        watchMinutes: 800,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 2000,
        watchMinutes: 960,
        avgViewDurationSeconds: 185,
      },
    });
    // Force a fresh now so the elapsed time is deterministic
    const freshState = {
      ...state,
      startedAt: '2026-07-01T11:00:00.000Z',
      nowIso: BASE_NOW,
    };
    const d = evaluatePackagingExperiment(freshState);
    expect(d.kind).toBe('continue');
    expect(d.guardrailViolations.some(v => v.rule === 'min_duration')).toBe(
      true
    );
  });

  it('returns continue when swap cooldown is active', () => {
    const state = makeState({
      // Last swap was 2 days ago — under 7-day cooldown
      lastSwapAt: '2026-06-29T12:00:00.000Z',
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('continue');
    expect(d.guardrailViolations.some(v => v.rule === 'swap_cooldown')).toBe(
      true
    );
  });

  it('returns rollback_control immediately on avg-view-duration regression', () => {
    const state = makeState({
      // Treatment impressions met, but AVD is down > 5%
      control: {
        impressions: 1000,
        watchMinutes: 500,
        avgViewDurationSeconds: 200,
      },
      treatment: {
        impressions: 1000,
        watchMinutes: 550,
        avgViewDurationSeconds: 180,
      }, // 10% lower
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('rollback_control');
    expect(
      d.guardrailViolations.some(v => v.rule === 'avg_view_duration_regression')
    ).toBe(true);
  });

  it('does NOT flag regression when treatment AVD is within tolerance', () => {
    const state = makeState({
      control: {
        impressions: 1000,
        watchMinutes: 500,
        avgViewDurationSeconds: 200,
      },
      // 3% lower — within 5% tolerance
      treatment: {
        impressions: 1000,
        watchMinutes: 600,
        avgViewDurationSeconds: 194,
      },
    });
    const d = evaluatePackagingExperiment(state);
    // Decision is always 'continue' now (confidence unavailable), but it
    // must NOT be the regression guardrail causing it.
    expect(
      d.guardrailViolations.every(
        v => v.rule !== 'avg_view_duration_regression'
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluatePackagingExperiment — Bayesian decisions
// ---------------------------------------------------------------------------

describe('evaluatePackagingExperiment — Bayesian decisions (deliberate-red: no unsupported auto-winner)', () => {
  it('does NOT auto-swap even when treatment appears to strongly outperform control — confidence is unavailable', () => {
    const state = makeState({
      control: {
        impressions: 5000,
        watchMinutes: 500,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 5000,
        watchMinutes: 1000,
        avgViewDurationSeconds: 185,
      },
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('continue');
    expect(d.probTreatmentWins).toBeNull();
    expect(d.requiresApproval).toBe(false);
    expect(
      d.guardrailViolations.some(v => v.rule === 'confidence_unavailable')
    ).toBe(true);
  });

  it('does NOT queue awaiting_approval on apparent wins even when autoPublishEnabled=false — confidence is unavailable regardless', () => {
    const state = makeState({
      autoPublishEnabled: false,
      control: {
        impressions: 5000,
        watchMinutes: 500,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 5000,
        watchMinutes: 1000,
        avgViewDurationSeconds: 185,
      },
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('continue');
    expect(d.probTreatmentWins).toBeNull();
  });

  it('does NOT auto-rollback even when treatment appears to clearly lose — confidence is unavailable', () => {
    const state = makeState({
      control: {
        impressions: 5000,
        watchMinutes: 1000,
        avgViewDurationSeconds: 200,
      },
      treatment: {
        impressions: 5000,
        watchMinutes: 500,
        avgViewDurationSeconds: 205,
      },
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('continue');
    expect(d.probTreatmentWins).toBeNull();
  });

  it('returns continue when variants are similar (also confidence-unavailable, not threshold ambiguity)', () => {
    const state = makeState({
      control: {
        impressions: 600,
        watchMinutes: 300,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 600,
        watchMinutes: 305,
        avgViewDurationSeconds: 182,
      },
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('continue');
  });

  it('returns inconclusive when test exceeds max duration, with confidence reported unavailable (not a fake 0%)', () => {
    const state = makeState({
      // Started 40 days ago
      startedAt: '2026-05-22T12:00:00.000Z',
      control: {
        impressions: 2000,
        watchMinutes: 1000,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 2000,
        watchMinutes: 1010,
        avgViewDurationSeconds: 181,
      },
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('inconclusive');
    expect(d.probTreatmentWins).toBeNull();
    expect(d.rationale).toContain('unavailable');
  });
});

// ---------------------------------------------------------------------------
// evaluatePackagingExperiment — invalid metrics input (deliberate-red)
// ---------------------------------------------------------------------------

describe('evaluatePackagingExperiment — invalid metrics (deliberate-red)', () => {
  it('holds (continue) instead of crashing or deciding on NaN watch minutes', () => {
    const state = makeState({
      treatment: {
        impressions: 1000,
        watchMinutes: Number.NaN,
        avgViewDurationSeconds: 185,
      },
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('continue');
    expect(d.probTreatmentWins).toBeNull();
    expect(Number.isFinite(d.watchMinutesPerImpressionTreatment)).toBe(true);
    expect(d.guardrailViolations.some(v => v.rule === 'invalid_metrics')).toBe(
      true
    );
  });

  it('holds (continue) on negative impressions instead of deciding', () => {
    const state = makeState({
      control: {
        impressions: -1,
        watchMinutes: 500,
        avgViewDurationSeconds: 180,
      },
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('continue');
    expect(d.guardrailViolations.some(v => v.rule === 'invalid_metrics')).toBe(
      true
    );
  });

  it('holds (continue) on non-finite avgViewDurationSeconds instead of deciding', () => {
    const state = makeState({
      treatment: {
        impressions: 1000,
        watchMinutes: 600,
        avgViewDurationSeconds: Number.POSITIVE_INFINITY,
      },
    });
    const d = evaluatePackagingExperiment(state);
    expect(d.kind).toBe('continue');
    expect(d.guardrailViolations.some(v => v.rule === 'invalid_metrics')).toBe(
      true
    );
  });
});

// ---------------------------------------------------------------------------
// evaluatePackagingExperiment — custom config
// ---------------------------------------------------------------------------

describe('evaluatePackagingExperiment — custom config', () => {
  it('respects custom minImpressionsPerVariant for the min_impressions guardrail', () => {
    const state = makeState({
      control: {
        impressions: 300,
        watchMinutes: 150,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 300,
        watchMinutes: 180,
        avgViewDurationSeconds: 185,
      },
    });
    // Default requires 500; custom allows 200
    const d = evaluatePackagingExperiment(state, {
      minImpressionsPerVariant: 200,
    });
    // 300 ≥ 200 so min_impressions should not fire
    expect(d.guardrailViolations.every(v => v.rule !== 'min_impressions')).toBe(
      true
    );
  });

  it('never swaps on a custom winThreshold — confidence-unavailable gate applies regardless of threshold', () => {
    const state = makeState({
      control: {
        impressions: 2000,
        watchMinutes: 800,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 2000,
        watchMinutes: 900,
        avgViewDurationSeconds: 183,
      },
    });
    const dHigh = evaluatePackagingExperiment(state, { winThreshold: 0.999 });
    const dLow = evaluatePackagingExperiment(state, { winThreshold: 0.001 });
    // No threshold, however permissive, can produce an automatic winner from
    // an unavailable confidence value — both hold on 'continue'.
    expect(dHigh.kind).toBe('continue');
    expect(dLow.kind).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// buildDecisionLogEntry
// ---------------------------------------------------------------------------

describe('buildDecisionLogEntry', () => {
  it('serializes all fields correctly', () => {
    const state = makeState();
    const d = evaluatePackagingExperiment(state);
    const entry = buildDecisionLogEntry(state, d);

    expect(entry.experimentId).toBe(state.experimentId);
    expect(entry.videoId).toBe(state.videoId);
    expect(entry.channelId).toBe(state.channelId);
    expect(entry.decision).toBe(d);
    expect(entry.controlMetrics).toBe(state.control);
    expect(entry.treatmentMetrics).toBe(state.treatment);
    expect(entry.loggedAt).toBe(d.decidedAt);
  });

  it('includes rationale and guardrail violations', () => {
    const state = makeState({
      control: {
        impressions: 50,
        watchMinutes: 25,
        avgViewDurationSeconds: 180,
      },
      treatment: {
        impressions: 50,
        watchMinutes: 30,
        avgViewDurationSeconds: 183,
      },
    });
    const d = evaluatePackagingExperiment(state);
    const entry = buildDecisionLogEntry(state, d);
    expect(entry.decision.rationale).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// WorkflowDefinition registration (smoke test)
// ---------------------------------------------------------------------------

describe('WorkflowDefinition registration', () => {
  it('YOUTUBE_PACKAGING_EXPERIMENT_KIND is the expected string', () => {
    expect(YOUTUBE_PACKAGING_EXPERIMENT_KIND).toBe(
      'youtube_packaging_experiment'
    );
  });

  it('workflow kind is registered in the registry', async () => {
    const { getWorkflow } = await import('@/lib/workflows/registry');
    const def = getWorkflow(YOUTUBE_PACKAGING_EXPERIMENT_KIND);
    expect(def).toBeDefined();
    expect(def?.kind).toBe(YOUTUBE_PACKAGING_EXPERIMENT_KIND);
    expect(def?.requiredConnectors).toContain('youtube_oauth');
  });
});

// ---------------------------------------------------------------------------
// Min impressions constant is exported and correct
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('DEFAULT_MIN_IMPRESSIONS matches issue spec (~500 start)', () => {
    expect(DEFAULT_MIN_IMPRESSIONS).toBe(500);
  });

  it('DEFAULT_WIN_THRESHOLD is 0.9', () => {
    expect(DEFAULT_WIN_THRESHOLD).toBe(0.9);
  });

  it('DEFAULT_LOSE_THRESHOLD is 0.1', () => {
    expect(DEFAULT_LOSE_THRESHOLD).toBe(0.1);
  });
});
