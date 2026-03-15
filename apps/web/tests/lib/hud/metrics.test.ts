import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHudMetrics } from '@/lib/hud/metrics';

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
    p95LatencyMs: 250,
    incidents24h: 0,
    lastIncidentAt: null,
  })),
}));

vi.mock('@/lib/db', () => ({
  checkDbHealth: vi.fn(async () => ({
    healthy: true,
    latency: 15,
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getHudMetrics', () => {
  it('degrades deployment metrics when GitHub request times out', async () => {
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError);

    const metrics = await getHudMetrics('admin');

    expect(metrics.deployments.availability).toBe('error');
    expect(metrics.deployments.current).toBeNull();
    expect(metrics.deployments.recent).toEqual([]);
    expect(metrics.deployments.errorMessage).toContain(
      'External request timed out'
    );
  });
});
