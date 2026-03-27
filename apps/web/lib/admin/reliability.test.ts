import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckDbHealth = vi.hoisted(() => vi.fn());
const mockDoesTableExist = vi.hoisted(() => vi.fn());
const mockGetAdminSentryMetrics = vi.hoisted(() => vi.fn());
const mockGetHudDeployments = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  checkDbHealth: mockCheckDbHealth,
  db: {},
  doesTableExist: mockDoesTableExist,
  TABLE_NAMES: {
    stripeWebhookEvents: 'stripe_webhook_events',
    creatorProfiles: 'creator_profiles',
  },
}));

vi.mock('./sentry-metrics', () => ({
  getAdminSentryMetrics: mockGetAdminSentryMetrics,
}));

vi.mock('@/lib/deployments/github', () => ({
  getHudDeployments: mockGetHudDeployments,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

import { getAdminReliabilitySummary } from './reliability';

describe('getAdminReliabilitySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mockCheckDbHealth.mockResolvedValue({ latency: 42 });
    mockDoesTableExist.mockResolvedValue(false);
    mockGetAdminSentryMetrics.mockResolvedValue({ unresolvedIssues24h: 3 });
    mockGetHudDeployments.mockResolvedValue({
      availability: 'available',
      current: { status: 'success' },
      recent: [],
    });
    mockGetRedis.mockReturnValue(null);
  });

  it('marks redis available only when the live ping succeeds', async () => {
    mockGetRedis.mockReturnValue({
      ping: vi.fn().mockResolvedValue('PONG'),
    });

    const summary = await getAdminReliabilitySummary();

    expect(summary).toMatchObject({
      redisAvailable: true,
      unresolvedSentryIssues24h: 3,
      deploymentAvailability: 'available',
      deploymentState: 'success',
      p95LatencyMs: 42,
    });
  });

  it('marks redis unavailable when no Redis client is configured', async () => {
    const summary = await getAdminReliabilitySummary();

    expect(summary.redisAvailable).toBe(false);
  });

  it('marks redis unavailable when the client exists but ping fails', async () => {
    mockGetRedis.mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
    });

    const summary = await getAdminReliabilitySummary();

    expect(summary.redisAvailable).toBe(false);
  });

  it('marks redis unavailable when the ping times out', async () => {
    vi.useFakeTimers();
    mockGetRedis.mockImplementation(({ signal }: { signal?: AbortSignal }) => ({
      ping: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => {
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
          })
      ),
    }));

    const summaryPromise = getAdminReliabilitySummary();

    await vi.advanceTimersByTimeAsync(250);

    await expect(summaryPromise).resolves.toMatchObject({
      redisAvailable: false,
    });
  });

  it('falls back safely when stripe event table introspection fails', async () => {
    mockDoesTableExist.mockRejectedValue(
      new Error('table introspection failed')
    );

    await expect(getAdminReliabilitySummary()).resolves.toMatchObject({
      incidents24h: 0,
      lastIncidentAt: null,
      redisAvailable: false,
    });
  });
});
