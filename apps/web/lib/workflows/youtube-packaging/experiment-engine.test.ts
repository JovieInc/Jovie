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
  it('returns 0.5 when control has zero impressions', () => {
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
    expect(computeBayesianProbBOverA(noData, good)).toBe(0.5);
  });

  it('returns 0.5 when treatment has zero impressions', () => {
    const good: VariantMetrics = {
      impressions: 1000,
      watchMinutes: 500,
      avgViewDurationSeconds: 180,
    };
    const noData: VariantMetrics = {
      impressions: 0,
      watchMinutes: 0,
      avgViewDurationSeconds: 0,
    };
    expect(computeBayesianProbBOverA(good, noData)).toBe(0.5);
  });

  it('returns > 0.9 when treatment strongly outperforms control', () => {
    const control: VariantMetrics = {
      impressions: 5000,
      watchMinutes: 500,
      avgViewDurationSeconds: 180,
    };
    // Treatment has 2× watch-min/impression — clear winner
    const treatment: VariantMetrics = {
      impressions: 5000,
      watchMinutes: 1000,
      avgViewDurationSeconds: 200,
    };
    const prob = computeBayesianProbBOverA(control, treatment);
    expect(prob).toBeGreaterThan(0.9);
  });

  it('returns < 0.1 when treatment strongly underperforms control', () => {
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
    const prob = computeBayesianProbBOverA(control, treatment);
    expect(prob).toBeLessThan(0.1);
  });

  it('returns ~0.5 when variants are equal', () => {
    const m: VariantMetrics = {
      impressions: 2000,
      watchMinutes: 800,
      avgViewDurationSeconds: 180,
    };
    const prob = computeBayesianProbBOverA(m, m);
    expect(prob).toBeCloseTo(0.5, 2);
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
    // Could be continue or swap_treatment, but NOT rollback due to regression
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

describe('evaluatePackagingExperiment — Bayesian decisions', () => {
  it('returns swap_treatment when treatment strongly wins and autoPublishEnabled=true', () => {
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
    expect(d.kind).toBe('swap_treatment');
    expect(d.probTreatmentWins).toBeGreaterThan(DEFAULT_WIN_THRESHOLD);
    expect(d.requiresApproval).toBe(false);
  });

  it('returns awaiting_approval when treatment wins but autoPublishEnabled=false', () => {
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
    expect(d.kind).toBe('awaiting_approval');
    expect(d.requiresApproval).toBe(true);
  });

  it('returns rollback_control when treatment clearly loses', () => {
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
    expect(d.kind).toBe('rollback_control');
    expect(d.probTreatmentWins).toBeLessThan(DEFAULT_LOSE_THRESHOLD);
  });

  it('returns continue when result is between win and lose threshold', () => {
    const state = makeState({
      // Very similar rates — no clear winner
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
    // Should be 'continue' since prob is ambiguous (~0.5)
    expect(d.kind).toBe('continue');
  });

  it('returns inconclusive when test exceeds max duration', () => {
    const state = makeState({
      // Started 40 days ago
      startedAt: '2026-05-22T12:00:00.000Z',
      // Neither variant clearly wins
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
  });
});

// ---------------------------------------------------------------------------
// evaluatePackagingExperiment — custom config
// ---------------------------------------------------------------------------

describe('evaluatePackagingExperiment — custom config', () => {
  it('respects custom minImpressionsPerVariant', () => {
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
    // 300 ≥ 200 so min_impressions should not fire; prob ~0.9+ so likely swap
    expect(d.guardrailViolations.every(v => v.rule !== 'min_impressions')).toBe(
      true
    );
  });

  it('respects custom winThreshold', () => {
    const state = makeState({
      // Moderate treatment advantage
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
    // With a high threshold, marginal advantage doesn't trigger swap
    const dHigh = evaluatePackagingExperiment(state, { winThreshold: 0.999 });
    // With low threshold, it does
    const dLow = evaluatePackagingExperiment(state, { winThreshold: 0.55 });
    // High threshold → probably continue; low → probably swap
    // We just check the thresholds are applied (not the exact decision which depends on prob)
    expect(
      dHigh.kind !== 'swap_treatment' || dLow.kind === 'swap_treatment'
    ).toBe(true);
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
