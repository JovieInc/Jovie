import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearAdminSentryMetricsCache,
  getAdminSentryMetrics,
} from '@/lib/admin/sentry-metrics';

vi.mock('@/lib/env-server', () => ({
  env: {
    SENTRY_AUTH_TOKEN: 'sentry-token',
    SENTRY_ORG_SLUG: 'jovie',
  },
}));

afterEach(() => {
  clearAdminSentryMetricsCache();
  vi.restoreAllMocks();
});

describe('getAdminSentryMetrics', () => {
  it('returns computed metrics from unresolved issues', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          level: 'fatal',
          count: '15',
          userCount: 7,
          shortId: 'JOVIE-WEB-2D4',
          title: 'TypeError on checkout',
        },
        {
          level: 'error',
          count: '5',
          userCount: 3,
          shortId: 'JOVIE-WEB-9F8',
          title: 'API timeout in billing sync',
        },
      ],
    } as Response);

    const metrics = await getAdminSentryMetrics();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(metrics).toMatchObject({
      unresolvedIssues24h: 2,
      totalEvents24h: 20,
      impactedUsers24h: 10,
      criticalIssues24h: 1,
      topIssueShortId: 'JOVIE-WEB-2D4',
      topIssueTitle: 'TypeError on checkout',
      isConfigured: true,
      isAvailable: true,
    });
  });

  it('gracefully degrades when sentry api returns error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    const metrics = await getAdminSentryMetrics();

    expect(metrics.unresolvedIssues24h).toBe(0);
    expect(metrics.isConfigured).toBe(true);
    expect(metrics.isAvailable).toBe(false);
    expect(metrics.errorMessage).toContain('401 Unauthorized');
  });
});
