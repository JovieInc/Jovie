import { describe, expect, it } from 'vitest';
import type { FounderFunnelData } from '@/lib/admin/types';
import {
  deriveOpsExceptions,
  OPS_BOTTLENECK_LIMIT,
  rankOpsBottlenecks,
} from '@/lib/hud/cockpit';
import type { HudMetrics } from '@/types/hud';

function okSource(key: string, label: string) {
  return {
    key,
    label,
    state: 'ok' as const,
    fetchedAtIso: '2026-09-28T12:00:00.000Z',
    errorMessage: null,
    dashboardUrl: null,
    configureUrl: null,
    nextStep: null,
  };
}

function healthyMetrics(overrides: Partial<HudMetrics> = {}): HudMetrics {
  return {
    operations: { status: 'ok', dbLatencyMs: 12 },
    reliability: {
      unresolvedSentryIssues24h: 0,
      p95LatencyMs: 40,
      errorRatePercent: 0.1,
      reliabilityScorePercent: 99.9,
      incidents24h: 0,
      lastIncidentAtIso: null,
    },
    testing: {
      quarantine: { isValid: true, withinRetryBudget: true, activeCount: 0 },
    },
    deployments: {
      availability: 'available',
      current: { status: 'success', branch: 'main', url: null },
      recent: [],
    },
    aiOps: {
      availability: 'available',
      counts: {
        queued: 0,
        running: 2,
        blocked: 0,
        review: 0,
        done: 0,
        failed: 0,
        stale: 0,
      },
      mergeQueue: {
        openAgentPrs: 1,
        openAgentPrThreshold: 8,
        pressure: 'normal',
      },
      blockers: [],
    },
    gbrain: { status: 'ok', version: '1.0.0' },
    sources: {
      stripe: okSource('stripe', 'Stripe'),
      mercury: okSource('mercury', 'Mercury'),
      database: okSource('database', 'Database'),
      sentry: okSource('sentry', 'Sentry'),
      github: okSource('github', 'GitHub'),
    },
    generatedAtIso: '2026-09-28T12:00:00.000Z',
    ...overrides,
  } as unknown as HudMetrics;
}

describe('deriveOpsExceptions', () => {
  it('returns no exceptions for a healthy company', () => {
    expect(deriveOpsExceptions(healthyMetrics())).toEqual([]);
  });

  it('flags a failed deploy and degraded database in plain language', () => {
    const metrics = healthyMetrics({
      operations: {
        status: 'degraded',
        dbLatencyMs: 240,
        checkedAtIso: '2026-09-28T12:00:00.000Z',
      },
      deployments: {
        availability: 'available',
        current: {
          id: 1,
          runNumber: 42,
          status: 'failure',
          createdAtIso: '2026-09-28T11:00:00.000Z',
          branch: 'main',
          url: 'https://example.com/run/42',
        },
        recent: [],
      },
    });

    const labels = deriveOpsExceptions(metrics).map(entry => entry.label);
    expect(labels).toContain('Database is degraded');
    expect(labels).toContain('Latest deploy failed');
  });

  it('surfaces disconnected metric sources without jargon', () => {
    const metrics = healthyMetrics();
    metrics.sources.stripe = {
      ...metrics.sources.stripe,
      state: 'unavailable',
    };

    const labels = deriveOpsExceptions(metrics).map(entry => entry.label);
    expect(labels).toContain('Stripe is unreachable');
    for (const label of labels) {
      expect(label.toLowerCase()).not.toMatch(
        /env|dispatch|diagnostic|agent os/
      );
    }
  });
});

describe('rankOpsBottlenecks', () => {
  const funnel: FounderFunnelData = {
    timeRange: '30d',
    biggestDropOffKey: 'accounts_created',
    errors: [],
    stages: [
      {
        key: 'onboarding_chats',
        label: 'Onboarding chats',
        description: '',
        count: 100,
        conversionRate: null,
        dropOff: null,
      },
      {
        key: 'accounts_created',
        label: 'Accounts created',
        description: '',
        count: 40,
        conversionRate: 0.4,
        dropOff: 60,
      },
    ],
  };

  it('returns an empty list when nothing is constraining the company', () => {
    expect(rankOpsBottlenecks(healthyMetrics(), null)).toEqual([]);
  });

  it('ranks a failing deploy above the funnel leak', () => {
    const metrics = healthyMetrics({
      deployments: {
        availability: 'available',
        current: {
          id: 1,
          runNumber: 42,
          status: 'failure',
          createdAtIso: '2026-09-28T11:00:00.000Z',
          branch: 'main',
          url: null,
        },
        recent: [],
      },
    });

    const bottlenecks = rankOpsBottlenecks(metrics, funnel);
    expect(bottlenecks[0]?.id).toBe('deploy-failed');
    expect(bottlenecks[1]?.id).toBe('funnel-drop-off');
  });

  it('caps the ranked list at the cockpit limit', () => {
    const metrics = healthyMetrics({
      deployments: {
        availability: 'available',
        current: {
          id: 1,
          runNumber: 42,
          status: 'failure',
          createdAtIso: '2026-09-28T11:00:00.000Z',
          branch: 'main',
          url: null,
        },
        recent: [],
      },
      reliability: {
        unresolvedSentryIssues24h: 9,
        p95LatencyMs: 40,
        errorRatePercent: 1,
        reliabilityScorePercent: 99,
        incidents24h: 1,
        lastIncidentAtIso: null,
      },
      aiOps: {
        availability: 'available',
        counts: {
          queued: 0,
          running: 0,
          blocked: 3,
          review: 0,
          done: 0,
          failed: 1,
          stale: 0,
        },
        mergeQueue: {
          openAgentPrs: 4,
          openAgentPrThreshold: 8,
          pressure: 'elevated',
        },
        blockers: [],
      },
      sources: {
        ...healthyMetrics().sources,
        stripe: { ...okSource('stripe', 'Stripe'), state: 'unavailable' },
      },
    } as Partial<HudMetrics>);

    const bottlenecks = rankOpsBottlenecks(metrics, funnel);
    expect(bottlenecks.length).toBe(OPS_BOTTLENECK_LIMIT);
    expect(bottlenecks.map(entry => entry.id)).toEqual([
      'deploy-failed',
      'funnel-drop-off',
      'agent-work-blocked',
    ]);
  });
});
