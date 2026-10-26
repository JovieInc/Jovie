import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { FounderFunnelData } from '@/lib/admin/types';
import {
  deriveOpsExceptions,
  OPS_BOTTLENECK_LIMIT,
  rankOpsBottlenecks,
} from '@/lib/hud/cockpit';
import type { HudMetrics } from '@/types/hud';

const NOW_ISO = '2026-09-28T12:00:00.000Z';
const NOW = Date.parse(NOW_ISO);

function okSource(
  key: string,
  label: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    key,
    label,
    state: 'ok' as const,
    fetchedAtIso: NOW_ISO,
    errorMessage: null,
    dashboardUrl: null,
    configureUrl: null,
    nextStep: null,
    ...overrides,
  };
}

const failedDeploy = (branch: string | null, url: string | null) => ({
  availability: 'available',
  current: {
    id: 1,
    runNumber: 42,
    status: 'failure',
    createdAtIso: '2026-09-28T11:00:00.000Z',
    branch,
    url,
  },
  recent: [],
});

const aiOps = (
  blocked: number,
  failed: number,
  blockers: Array<{ summary: string; url: string | null }> = []
) => ({
  availability: 'available',
  counts: {
    queued: 0,
    running: 0,
    blocked,
    review: 0,
    done: 0,
    failed,
    stale: 0,
  },
  mergeQueue: { openAgentPrs: 0, openAgentPrThreshold: 8, pressure: 'normal' },
  blockers,
});

const reliability = (unresolved: number, p95: number | null = 40) => ({
  unresolvedSentryIssues24h: unresolved,
  p95LatencyMs: p95,
  errorRatePercent: 0.1,
  reliabilityScorePercent: 99.9,
  incidents24h: 0,
  lastIncidentAtIso: null,
});

function healthyMetrics(overrides: Record<string, unknown> = {}): HudMetrics {
  return {
    overview: { financialDataAvailable: true },
    operations: { status: 'ok', dbLatencyMs: 12 },
    reliability: reliability(0),
    testing: {
      quarantine: { isValid: true, withinRetryBudget: true, activeCount: 0 },
    },
    deployments: {
      availability: 'available',
      current: { status: 'success', branch: 'main', url: null },
      recent: [],
    },
    aiOps: aiOps(0, 0),
    gbrain: { status: 'ok', version: '1.0.0' },
    sources: {
      stripe: okSource('stripe', 'Stripe'),
      mercury: okSource('mercury', 'Mercury'),
      database: okSource('database', 'Database'),
      sentry: okSource('sentry', 'Sentry', {
        dashboardUrl: 'https://sentry.example/issues',
      }),
      github: okSource('github', 'GitHub'),
    },
    generatedAtIso: NOW_ISO,
    ...overrides,
  } as unknown as HudMetrics;
}

const exceptions = (overrides: Record<string, unknown> = {}) =>
  deriveOpsExceptions(healthyMetrics(overrides), NOW);

describe('deriveOpsExceptions', () => {
  it('returns no exceptions for a healthy company', () => {
    expect(exceptions()).toEqual([]);
  });

  it('reports degraded operations with rounded latency', () => {
    expect(
      exceptions({ operations: { status: 'degraded', dbLatencyMs: 240.4 } })
    ).toEqual([
      {
        id: 'operations-degraded',
        label: 'Database is degraded',
        detail: 'Latency 240ms',
        href: APP_ROUTES.ADMIN_OPERATIONS,
      },
    ]);
    expect(
      exceptions({ operations: { status: 'down', dbLatencyMs: null } })
    ).toEqual([
      expect.objectContaining({ id: 'operations-degraded', detail: null }),
    ]);
  });

  it('reports a failed deploy with its branch and run link', () => {
    expect(
      exceptions({ deployments: failedDeploy('main', 'https://ci/run/42') })
    ).toEqual([
      {
        id: 'deploy-failed',
        label: 'Latest deploy failed',
        detail: 'main',
        href: 'https://ci/run/42',
      },
    ]);
  });

  it('ignores a missing current deploy', () => {
    expect(
      exceptions({
        deployments: { availability: 'unavailable', current: null, recent: [] },
      })
    ).toEqual([]);
  });

  it('counts unresolved errors with p95 detail and the Sentry link', () => {
    expect(exceptions({ reliability: reliability(1, 40.6) })).toEqual([
      {
        id: 'unresolved-errors',
        label: '1 unresolved error in 24h',
        detail: 'p95 41ms',
        href: 'https://sentry.example/issues',
      },
    ]);
    expect(exceptions({ reliability: reliability(1234, null) })).toEqual([
      expect.objectContaining({
        label: '1,234 unresolved errors in 24h',
        detail: null,
      }),
    ]);
  });

  it('falls back to no link when Sentry is not a source', () => {
    const metrics = healthyMetrics({ reliability: reliability(2) });
    delete (metrics.sources as unknown as Record<string, unknown>).sentry;
    expect(deriveOpsExceptions(metrics, NOW)).toEqual([
      expect.objectContaining({ id: 'unresolved-errors', href: null }),
    ]);
  });

  it('prefers the invalid-ledger quarantine exception over the retry budget', () => {
    expect(
      exceptions({
        testing: {
          quarantine: {
            isValid: false,
            withinRetryBudget: false,
            activeCount: 4,
          },
        },
      })
    ).toEqual([
      {
        id: 'quarantine-invalid',
        label: 'Test quarantine ledger is invalid',
        detail: null,
        href: null,
      },
    ]);
  });

  it.each([
    [1, '1 quarantined test'],
    [3, '3 quarantined tests'],
  ])('reports %i quarantined tests over the retry budget', (count, detail) => {
    expect(
      exceptions({
        testing: {
          quarantine: {
            isValid: true,
            withinRetryBudget: false,
            activeCount: count,
          },
        },
      })
    ).toEqual([
      {
        id: 'quarantine-over-budget',
        label: 'Flaky tests are over the retry budget',
        detail,
        href: null,
      },
    ]);
  });

  it('sums blocked and failed agent work and links the first blocker', () => {
    expect(
      exceptions({
        aiOps: aiOps(2, 1, [
          { summary: 'Waiting on review', url: 'https://gh/pr/1' },
          { summary: 'Second', url: 'https://gh/pr/2' },
        ]),
      })
    ).toEqual([
      {
        id: 'agent-work-blocked',
        label: '3 agent tasks blocked or failed',
        detail: 'Waiting on review',
        href: 'https://gh/pr/1',
      },
    ]);
    expect(exceptions({ aiOps: aiOps(0, 1) })).toEqual([
      {
        id: 'agent-work-blocked',
        label: '1 agent task blocked or failed',
        detail: null,
        href: null,
      },
    ]);
  });

  it('reports company memory only when it is down', () => {
    expect(exceptions({ gbrain: { status: 'down' } })).toEqual([
      {
        id: 'company-memory-down',
        label: 'Company memory is down',
        detail: null,
        href: null,
      },
    ]);
    expect(exceptions({ gbrain: { status: 'degraded' } })).toEqual([]);
    expect(exceptions({ gbrain: undefined })).toEqual([]);
  });

  it('lists company exceptions before source exceptions, in a fixed order', () => {
    const metrics = healthyMetrics({
      operations: { status: 'degraded', dbLatencyMs: 1 },
      deployments: failedDeploy('main', null),
      reliability: reliability(1),
      testing: {
        quarantine: { isValid: false, withinRetryBudget: true, activeCount: 0 },
      },
      aiOps: aiOps(1, 0),
      gbrain: { status: 'down' },
      overview: { financialDataAvailable: false },
    });
    metrics.sources.github = okSource('github', 'GitHub', {
      state: 'degraded',
    }) as HudMetrics['sources']['github'];
    expect(deriveOpsExceptions(metrics, NOW).map(e => e.id)).toEqual([
      'operations-degraded',
      'deploy-failed',
      'unresolved-errors',
      'quarantine-invalid',
      'agent-work-blocked',
      'company-memory-down',
      'money-sources-contradiction',
      'source-github',
    ]);
  });

  it('measures staleness against the supplied clock', () => {
    const metrics = healthyMetrics();
    expect(
      deriveOpsExceptions(metrics, NOW + 6 * 60_000).map(e => e.id)
    ).toEqual([
      'source-stale-stripe',
      'source-stale-mercury',
      'source-stale-database',
      'source-stale-sentry',
      'source-stale-github',
    ]);
  });
});

describe('rankOpsBottlenecks', () => {
  const funnel = (
    dropOff: number | null,
    biggestDropOffKey: string | null = 'accounts_created'
  ): FounderFunnelData => ({
    timeRange: '30d',
    biggestDropOffKey,
    errors: [],
    definitionVersion: 'founder-funnel.v2',
    stages: [
      {
        key: 'onboarding_chats',
        label: 'Onboarding chats',
        description: '',
        count: 100,
        conversionRate: null,
        dropOff: null,
        identifiable: false,
        drillDownHref: null,
      },
      {
        key: 'accounts_created',
        label: 'Accounts created',
        description: '',
        count: 40,
        conversionRate: 0.4,
        dropOff,
        identifiable: true,
        drillDownHref: null,
      },
    ],
  });

  it('returns an empty list when nothing is constraining the company', () => {
    expect(rankOpsBottlenecks(healthyMetrics(), null)).toEqual([]);
    expect(rankOpsBottlenecks(healthyMetrics())).toEqual([]);
  });

  it('describes a failing deploy with or without a branch', () => {
    expect(
      rankOpsBottlenecks(
        healthyMetrics({ deployments: failedDeploy('main', 'https://ci/1') })
      )
    ).toEqual([
      {
        id: 'deploy-failed',
        title: 'Shipping pipeline is failing',
        detail: 'Latest deploy failed on main',
        href: 'https://ci/1',
      },
    ]);
    expect(
      rankOpsBottlenecks(
        healthyMetrics({ deployments: failedDeploy(null, null) })
      )
    ).toEqual([
      expect.objectContaining({ detail: 'Latest deploy failed', href: null }),
    ]);
  });

  it('names the biggest funnel leak and how many users it loses', () => {
    expect(rankOpsBottlenecks(healthyMetrics(), funnel(60))).toEqual([
      {
        id: 'funnel-drop-off',
        title: 'Funnel leaks at Accounts created',
        detail: '60 users lost between stages',
        href: null,
      },
    ]);
    expect(rankOpsBottlenecks(healthyMetrics(), funnel(1))[0]?.detail).toBe(
      '1 user lost between stages'
    );
  });

  it.each([
    ['no drop-off', funnel(0)],
    ['unknown drop-off', funnel(null)],
    ['no biggest stage', funnel(60, null)],
    ['unknown biggest stage', funnel(60, 'paid')],
  ])('ignores a funnel with %s', (_label, data) => {
    expect(rankOpsBottlenecks(healthyMetrics(), data)).toEqual([]);
  });

  it('reports blocked agent work and unresolved errors', () => {
    expect(
      rankOpsBottlenecks(
        healthyMetrics({
          aiOps: aiOps(1, 1, [{ summary: 'Stuck', url: 'https://gh/1' }]),
          reliability: reliability(1),
        })
      )
    ).toEqual([
      {
        id: 'agent-work-blocked',
        title: '2 agent tasks blocked or failed',
        detail: 'Stuck',
        href: 'https://gh/1',
      },
      {
        id: 'unresolved-errors',
        title: '1 unresolved error in 24h',
        detail: null,
        href: null,
      },
    ]);
  });

  it('flags untrusted revenue data and links the first failing money source', () => {
    const metrics = healthyMetrics();
    metrics.sources.mercury = okSource('mercury', 'Mercury', {
      state: 'not_configured',
      dashboardUrl: 'https://mercury.example',
    }) as HudMetrics['sources']['mercury'];
    expect(rankOpsBottlenecks(metrics)).toEqual([
      {
        id: 'money-data-untrusted',
        title: 'Revenue data is stale or disconnected',
        detail: 'Company numbers cannot be trusted until sources recover',
        href: 'https://mercury.example',
      },
    ]);
  });

  it('does not flag revenue data for a failing non-money source', () => {
    const metrics = healthyMetrics();
    metrics.sources.github = okSource('github', 'GitHub', {
      state: 'unavailable',
    }) as HudMetrics['sources']['github'];
    expect(rankOpsBottlenecks(metrics)).toEqual([]);
  });

  it('ranks by severity and caps the list', () => {
    const metrics = healthyMetrics({
      deployments: failedDeploy('main', null),
      reliability: reliability(9),
      aiOps: aiOps(3, 1),
    });
    metrics.sources.stripe = okSource('stripe', 'Stripe', {
      state: 'unavailable',
    }) as HudMetrics['sources']['stripe'];
    expect(OPS_BOTTLENECK_LIMIT).toBe(3);
    expect(rankOpsBottlenecks(metrics, funnel(60)).map(b => b.id)).toEqual([
      'deploy-failed',
      'funnel-drop-off',
      'agent-work-blocked',
    ]);
    expect(rankOpsBottlenecks(metrics).map(b => b.id)).toEqual([
      'deploy-failed',
      'agent-work-blocked',
      'unresolved-errors',
    ]);
  });
});
