import { describe, expect, it } from 'vitest';
import type { FounderFunnelData } from '@/lib/admin/founder-funnel';
import {
  composeDecisionHudView,
  DECISION_HUD_MAX_ITEMS,
  type DecisionSignalCandidate,
  rankDecisionSignals,
  scoreDecisionSignal,
} from '@/lib/hud/decision-signals';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';

function baseCandidate(
  overrides: Partial<DecisionSignalCandidate>
): DecisionSignalCandidate {
  return {
    id: 'test',
    owner: 'ops',
    source: 'test',
    title: 'Signal',
    whyNow: 'why',
    currentValue: 'now',
    delta: null,
    target: null,
    confidence: 1,
    freshness: 'fresh',
    goalPath: 'revenue',
    causalHypothesis: null,
    nextAction: 'Do the thing',
    expectedImpact: 0.5,
    urgency: 0.5,
    informationGain: 0.5,
    unblockValue: 0.5,
    attentionCost: 1,
    summerCanAct: true,
    removalEvent: 'done',
    ...overrides,
  };
}

function snapshot(overrides: Partial<OvieMacHudSnapshot>): OvieMacHudSnapshot {
  return {
    alive: {
      cashUsd: 100_000,
      weeklyBurnUsd: 1_000,
      weeklyRevenueUsd: 2_000,
      weeklyRevenueGrowthRate: 0.05,
      available: true,
      status: 'alive',
      reachesProfitBeforeZero: true,
      detail: 'Revenue already covers burn.',
    },
    growth: {
      rate: 0.08,
      source: 'revenue',
      ycBar: 'good',
      thisWeek: 2_000,
      lastWeek: 1_850,
      available: true,
      showChart: false,
    },
    shipping: {
      shipsThisWeek: 3,
      available: true,
      detail: '',
    },
    inFlightPullRequests: {
      availability: 'available',
      totalOpen: 1,
      items: [],
      truncated: false,
      errorMessage: null,
    },
    generatedAtIso: '2026-09-26T00:00:00.000Z',
    ...overrides,
  };
}

function funnel(
  counts: readonly number[],
  biggestDropOffKey: string | null
): FounderFunnelData {
  const keys = [
    'onboarding_chats',
    'accounts_created',
    'profile_claimed',
    'onboarding_complete',
    'paid',
  ];
  return {
    timeRange: '30d',
    biggestDropOffKey,
    errors: [],
    definitionVersion: 'founder-funnel.v2',
    stages: keys.map((key, i) => ({
      key,
      label: key,
      description: '',
      count: counts[i] ?? 0,
      identifiable: true,
      drillDownHref: '',
      conversionRate:
        i === 0 || (counts[i - 1] ?? 0) <= 0
          ? null
          : (counts[i] ?? 0) / (counts[i - 1] ?? 1),
      dropOff: i === 0 ? null : (counts[i - 1] ?? 0) - (counts[i] ?? 0),
    })),
  };
}

describe('scoreDecisionSignal', () => {
  it('is explainable and monotonic in expected impact', () => {
    const low = scoreDecisionSignal(
      baseCandidate({ expectedImpact: 0.2 })
    ).score;
    const high = scoreDecisionSignal(
      baseCandidate({ expectedImpact: 0.9 })
    ).score;
    expect(high).toBeGreaterThan(low);
  });

  it('is zero when there is no action', () => {
    expect(scoreDecisionSignal(baseCandidate({ nextAction: null })).score).toBe(
      0
    );
  });
});

describe('rankDecisionSignals', () => {
  it('falls back to baseline mode when there are no candidates', () => {
    const view = rankDecisionSignals([]);
    expect(view.mode).toBe('baseline');
    expect(view.items).toHaveLength(0);
  });

  it('keeps metrics with no actionable consequence in drill-down', () => {
    const view = rankDecisionSignals([
      baseCandidate({ id: 'vanity', nextAction: null }),
      baseCandidate({ id: 'real', expectedImpact: 0.9 }),
    ]);
    expect(view.items.map(i => i.candidate.id)).toEqual(['real']);
    expect(view.drillDown).toEqual([
      expect.objectContaining({ id: 'vanity', reason: 'no_action' }),
    ]);
  });

  it('collapses symptom signals under one owner cause', () => {
    const view = rankDecisionSignals([
      baseCandidate({
        id: 'symptom-a',
        causeKey: 'incident-1',
        expectedImpact: 0.4,
      }),
      baseCandidate({
        id: 'symptom-b',
        causeKey: 'incident-1',
        expectedImpact: 0.9,
      }),
      baseCandidate({
        id: 'symptom-c',
        causeKey: 'incident-1',
        expectedImpact: 0.2,
      }),
    ]);
    expect(view.items.map(i => i.candidate.id)).toEqual(['symptom-b']);
    expect(view.drillDown).toHaveLength(2);
    expect(
      view.drillDown.every(
        d => d.reason === 'duplicate_of' && d.duplicateOf === 'symptom-b'
      )
    ).toBe(true);
  });

  it('lets deterministic p0 overrides outrank the score', () => {
    const view = rankDecisionSignals([
      baseCandidate({ id: 'big-score', expectedImpact: 1, urgency: 1 }),
      baseCandidate({
        id: 'p0',
        expectedImpact: 0.1,
        urgency: 0.1,
        priorityOverride: 'p0',
      }),
    ]);
    expect(view.items[0]?.candidate.id).toBe('p0');
    expect(view.items[0]?.priorityOverride).toBe(true);
  });

  it('caps items and sends overflow to drill-down', () => {
    const view = rankDecisionSignals(
      Array.from({ length: DECISION_HUD_MAX_ITEMS + 3 }, (_, i) =>
        baseCandidate({ id: `c-${i}`, expectedImpact: 0.9 })
      )
    );
    expect(view.items).toHaveLength(DECISION_HUD_MAX_ITEMS);
    expect(view.drillDown.filter(d => d.reason === 'over_limit')).toHaveLength(
      3
    );
  });

  it('treats unknown-trust signals as degraded, not ranked', () => {
    const view = rankDecisionSignals([
      baseCandidate({ id: 'stale-unknown', freshness: 'unknown' }),
    ]);
    expect(view.items).toHaveLength(0);
    expect(view.drillDown[0]).toEqual(
      expect.objectContaining({ id: 'stale-unknown', reason: 'untrusted' })
    );
    expect(view.degradedSources).toContain('test');
  });
});

describe('composeDecisionHudView scenarios', () => {
  it('surfaces the funnel bottleneck when activation is below target', () => {
    const view = composeDecisionHudView(snapshot({}), {
      funnel: funnel([1000, 200, 40, 30, 10], 'accounts_created'),
      funnelTargetRate: 0.05,
    });
    expect(view.mode).toBe('ranked');
    expect(view.items[0]?.candidate.id).toBe('funnel.bottleneck');
    expect(view.items[0]?.candidate.nextAction).toContain('accounts_created');
  });

  it('lets healthy activation recede so the next bottleneck surfaces', () => {
    const view = composeDecisionHudView(
      snapshot({
        shipping: { shipsThisWeek: 0, available: true, detail: '' },
      }),
      {
        funnel: funnel([100, 80, 60, 50, 20], 'onboarding_complete'),
        funnelTargetRate: 0.05,
      }
    );
    const ids = view.items.map(i => i.candidate.id);
    expect(ids).not.toContain('funnel.bottleneck');
    expect(ids).not.toContain('growth.below-yc-bar');
    expect(ids).toContain('shipping.zero-receipted-ships');
  });

  it('lets a stale dogfood artifact outrank healthy growth metrics', () => {
    const view = composeDecisionHudView(snapshot({}), {
      releaseFreshness: {
        staleArtifact: true,
        artifactLabel: 'desktop.dmg',
        lastValidAtIso: '2026-09-01T00:00:00.000Z',
      },
    });
    expect(view.items[0]?.candidate.id).toBe('release.stale-dogfood-artifact');
    expect(view.items[0]?.priorityOverride).toBe(true);
  });

  it('surfaces a Symphony capacity truth contradiction', () => {
    const view = composeDecisionHudView(snapshot({}), {
      capacityContradiction: {
        reportedAvailable: true,
        actualExhausted: true,
        detail: 'UI shows capacity; 0 free runners.',
      },
    });
    const ids = view.items.map(i => i.candidate.id);
    expect(ids).toContain('capacity.symphony-truth-contradiction');
  });

  it('keeps a changed-but-inconsequential metric out of the HUD', () => {
    const view = composeDecisionHudView(snapshot({}));
    // Healthy snapshot: growth good, ships landing, PRs available, alive.
    // No candidates are produced, so the JOV-5298 baseline anchors the screen.
    expect(view.items).toHaveLength(0);
    expect(view.mode).toBe('baseline');
  });

  it('marks default-dead as a p0 certification candidate', () => {
    const view = composeDecisionHudView(
      snapshot({
        alive: {
          cashUsd: 10_000,
          weeklyBurnUsd: 5_000,
          weeklyRevenueUsd: 0,
          weeklyRevenueGrowthRate: 0,
          available: true,
          status: 'dead',
          reachesProfitBeforeZero: false,
          detail: '$0 revenue with burn is default dead.',
        },
      })
    );
    expect(view.items[0]?.candidate.id).toBe('alive.default-dead');
    expect(view.items[0]?.priorityOverride).toBe(true);
    expect(view.items[0]?.candidate.actionKind).toBe('certification');
  });
});
