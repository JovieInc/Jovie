import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { ServerFetchTimeoutError } from '@/lib/http/server-fetch';
import { buildDegradedHudMetrics, getHudMetrics } from '@/lib/hud/metrics';

const mockGetHudDeployments = vi.hoisted(() => vi.fn());
const mockGetHudAiOpsSummary = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: {
    HUD_STARTUP_NAME: 'Jovie',
    HUD_STARTUP_LOGO_URL: null,
    HUD_GITHUB_TOKEN: 'token',
    HUD_GITHUB_OWNER: 'owner',
    HUD_GITHUB_REPO: 'repo',
    HUD_GITHUB_WORKFLOW: 'deploy.yml',
  },
}));

vi.mock('@/lib/admin/stripe-metrics', () => ({
  getAdminStripeOverviewMetrics: vi.fn(async () => ({
    mrrUsd: 1000,
    activeSubscribers: 25,
    mrrGrowth30dUsd: 50,
    isConfigured: true,
    isAvailable: true,
  })),
}));

vi.mock('@/lib/admin/mercury-metrics', () => ({
  getAdminMercuryMetrics: vi.fn(async () => ({
    balanceUsd: 10000,
    burnRateUsd: 2000,
    burnWindowDays: 30,
    isConfigured: true,
    isAvailable: true,
  })),
}));

vi.mock('@/lib/admin/overview', () => ({
  getAdminReliabilitySummary: vi.fn(async () => ({
    errorRatePercent: 0.1,
    reliabilityScorePercent: 99.9,
    p95LatencyMs: 250,
    incidents24h: 0,
    lastIncidentAt: null,
    unresolvedSentryIssues24h: 0,
  })),
}));

vi.mock('@/lib/admin/sentry-metrics', () => ({
  getAdminSentryMetrics: vi.fn(async () => ({
    unresolvedIssues24h: 0,
    totalEvents24h: 0,
    impactedUsers24h: 0,
    criticalIssues24h: 0,
    topIssueTitle: null,
    topIssueShortId: null,
    isConfigured: true,
    isAvailable: true,
  })),
}));

vi.mock('@/lib/db', () => ({
  checkDbHealth: vi.fn(async () => ({
    healthy: true,
    latency: 15,
  })),
}));

vi.mock('@/lib/deployments/github', () => ({
  getHudDeployments: mockGetHudDeployments,
}));

vi.mock('@/lib/hud/ai-ops', () => ({
  getHudAiOpsSummary: mockGetHudAiOpsSummary,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getHudMetrics', () => {
  beforeEach(() => {
    mockGetHudAiOpsSummary.mockResolvedValue({
      availability: 'not_configured',
      generatedAtIso: '2026-05-07T00:00:00.000Z',
      counts: {
        queued: 0,
        running: 0,
        blocked: 0,
        review: 0,
        done: 0,
        failed: 0,
        stale: 0,
      },
      dispatch: {
        available: false,
        unavailableReason: 'GH_DISPATCH_TOKEN is not configured.',
        runtimes: ['codex-cli', 'claude-code', 'ruflo'],
      },
      mergeQueue: {
        openAgentPrs: 0,
        openAgentPrThreshold: 10,
        pressure: 'normal',
      },
      runs: [],
      blockers: [],
      recommendations: [],
      sources: {
        github: {
          availability: 'not_configured',
          configured: false,
          itemCount: 0,
        },
        linear: {
          availability: 'not_configured',
          configured: false,
          itemCount: 0,
        },
        sentry: {
          availability: 'not_configured',
          configured: false,
          itemCount: 0,
        },
        hermes: { availability: 'available', configured: true, itemCount: 0 },
        ci: { availability: 'not_configured', configured: false, itemCount: 0 },
      },
    });
  });

  it('degrades deployment metrics when GitHub request times out', async () => {
    mockGetHudDeployments.mockResolvedValueOnce({
      availability: 'error',
      current: null,
      recent: [],
      errorMessage: 'External request timed out after 5000ms',
    });

    const metrics = await getHudMetrics('admin');

    expect(metrics.deployments.availability).toBe('error');
    expect(metrics.deployments.current).toBeNull();
    expect(metrics.deployments.recent).toEqual([]);
    expect(metrics.deployments.errorMessage).toContain(
      'External request timed out'
    );
  });

  it('includes degraded AI ops metrics without failing the HUD payload', async () => {
    mockGetHudDeployments.mockResolvedValueOnce({
      availability: 'not_configured',
      current: null,
      recent: [],
    });
    mockGetHudAiOpsSummary.mockResolvedValueOnce({
      availability: 'partial',
      generatedAtIso: '2026-05-07T00:00:00.000Z',
      counts: {
        queued: 1,
        running: 1,
        blocked: 1,
        review: 0,
        done: 0,
        failed: 0,
        stale: 0,
      },
      dispatch: {
        available: true,
        unavailableReason: null,
        runtimes: ['codex-cli', 'claude-code', 'ruflo'],
      },
      mergeQueue: {
        openAgentPrs: 1,
        openAgentPrThreshold: 10,
        pressure: 'normal',
      },
      runs: [],
      blockers: [],
      recommendations: [],
      sources: {
        github: { availability: 'available', configured: true, itemCount: 1 },
        linear: {
          availability: 'not_configured',
          configured: false,
          itemCount: 0,
        },
        sentry: {
          availability: 'not_configured',
          configured: false,
          itemCount: 0,
        },
        hermes: { availability: 'available', configured: true, itemCount: 0 },
        ci: { availability: 'error', configured: true, itemCount: 0 },
      },
      errorMessage: 'GitHub API error (404)',
    });

    const metrics = await getHudMetrics('admin');

    expect(metrics.aiOps.availability).toBe('partial');
    expect(metrics.aiOps.dispatch.available).toBe(true);
    expect(metrics.aiOps.counts.blocked).toBe(1);
  });

  it('includes per-source trust metadata in the HUD payload', async () => {
    mockGetHudDeployments.mockResolvedValueOnce({
      availability: 'not_configured',
      current: null,
      recent: [],
    });

    const metrics = await getHudMetrics('admin');

    expect(metrics.testing.quarantine.activeCount).toBeGreaterThanOrEqual(0);
    expect(metrics.testing.quarantine.retryBudgetCap).toBeGreaterThan(0);
    expect(metrics.sources.stripe.state).toBe('ok');
    expect(metrics.sources.mercury.state).toBe('ok');
    expect(metrics.sources.database.state).toBe('ok');
    expect(metrics.sources.sentry.state).toBe('ok');
    expect(metrics.sources.github.state).toBe('not_configured');
    expect(metrics.sources.stripe.fetchedAtIso).toBe(metrics.generatedAtIso);
  });

  it('returns degraded metrics when an upstream fetch times out', async () => {
    mockGetHudDeployments.mockResolvedValueOnce({
      availability: 'not_configured',
      current: null,
      recent: [],
    });
    vi.mocked(getAdminMercuryMetrics).mockRejectedValueOnce(
      new ServerFetchTimeoutError(
        'External request timed out after 8000ms',
        8000,
        'Mercury checking balance'
      )
    );

    const metrics = await getHudMetrics('kiosk');

    expect(metrics.accessMode).toBe('kiosk');
    expect(metrics.operations.status).toBe('degraded');
    expect(metrics.overview.financialDataAvailable).toBe(false);
    expect(metrics.overview.defaultStatusDetail).toContain(
      'Metrics temporarily unavailable due to upstream timeout'
    );
    expect(metrics.sources.mercury.state).toBe('unavailable');
    expect(metrics.sources.mercury.errorMessage).toContain(
      'Mercury checking balance timed out after 8000ms'
    );
  });

  it('buildDegradedHudMetrics exposes timeout context in source trust metadata', () => {
    const metrics = buildDegradedHudMetrics('admin', {
      context: 'GitHub workflow runs',
      timeoutMs: 5000,
    });

    expect(metrics.operations.status).toBe('degraded');
    expect(metrics.deployments.errorMessage).toContain(
      'GitHub workflow runs timed out after 5000ms'
    );
    expect(metrics.sources.github.state).toBe('unavailable');
  });

  it('marks financial data unavailable when Stripe is down', async () => {
    mockGetHudDeployments.mockResolvedValueOnce({
      availability: 'not_configured',
      current: null,
      recent: [],
    });
    vi.mocked(getAdminStripeOverviewMetrics).mockResolvedValueOnce({
      mrrUsd: 0,
      activeSubscribers: 0,
      mrrGrowth30dUsd: 0,
      isConfigured: true,
      isAvailable: false,
    });

    const metrics = await getHudMetrics('admin');

    expect(metrics.overview.financialDataAvailable).toBe(false);
    expect(metrics.overview.runwayMonths).toBeNull();
    expect(metrics.overview.defaultStatus).toBe('unknown');
    expect(metrics.overview.defaultStatusDetail).toContain(
      'Stripe (unavailable)'
    );
    expect(metrics.sources.stripe.state).toBe('unavailable');
    expect(metrics.sources.stripe.nextStep).toContain('retry');
  });
});
