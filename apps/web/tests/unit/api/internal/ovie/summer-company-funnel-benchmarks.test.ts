import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { funnelBenchmarkReport } from '@/lib/analytics/funnel-benchmarks';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  cache: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/ovie/company-state.server', () => ({
  readCompanyStateCache: hoisted.cache,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const route = await import(
  '@/app/api/internal/ovie/summer-company/funnel-benchmarks/route'
);

const URL = 'https://jov.ie/api/internal/ovie/summer-company/funnel-benchmarks';
const NOW = new Date('2026-10-26T23:00:00.000Z');

describe('GET /api/internal/ovie/summer-company/funnel-benchmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    hoisted.verify.mockResolvedValue(true);
  });

  afterEach(() => vi.useRealTimers());

  it('returns 401 without reading the funnel when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(hoisted.cache).not.toHaveBeenCalled();
  });

  it('returns the benchmark comparison uncached', async () => {
    const body = {
      contractVersion: 'summer-funnel/v2',
      observedAt: NOW.toISOString(),
      windows: {},
    };
    hoisted.cache.mockResolvedValue({
      snapshot: { sourcePayloads: { signupFunnel: body } },
    });
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(
      funnelBenchmarkReport(body as never)
    );
  });

  it.each([
    undefined,
    null,
    'not-a-date',
    2026,
    new Date(NOW.getTime() + 1).toISOString(),
    new Date(NOW.getTime() - 30 * 60_000 - 1).toISOString(),
    '2026-09-26T12:00:00.000Z',
  ])(
    'does not expose counts when raw funnel observation time is %j',
    async observedAt => {
      hoisted.cache.mockResolvedValue({
        snapshot: {
          generatedAt: NOW.toISOString(),
          sourcePayloads: {
            signupFunnel: {
              contractVersion: 'summer-funnel/v2',
              observedAt,
              windows: {
                '7d': {
                  funnels: [
                    {
                      funnelId: 'artist_signup',
                      steps: [{ step: 'claim_complete', count: 42 }],
                    },
                  ],
                },
              },
            },
          },
        },
      });
      const response = await route.GET(new Request(URL));
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        error: 'funnel_unavailable',
      });
      expect(hoisted.cache).toHaveBeenCalledTimes(1);
    }
  );

  it.each([0, 30 * 60_000 - 1, 30 * 60_000])(
    'serves a fresh zero-count observation at age %i as insufficient sample',
    async age => {
      const body = {
        contractVersion: 'summer-funnel/v2',
        observedAt: new Date(NOW.getTime() - age).toISOString(),
        windows: {
          '7d': {
            funnels: [
              {
                funnelId: 'artist_signup',
                steps: [{ step: 'claim_complete', count: 0 }],
              },
            ],
          },
        },
      };
      hoisted.cache.mockResolvedValue({
        snapshot: { sourcePayloads: { signupFunnel: body } },
      });
      const response = await route.GET(new Request(URL));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(
        funnelBenchmarkReport(body as never)
      );
    }
  );

  it('fails closed without fabricating a funnel on a cache miss', async () => {
    hoisted.cache.mockResolvedValue(null);
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'funnel_unavailable',
    });
  });

  it('fails closed with 503 and reports the error', async () => {
    hoisted.cache.mockRejectedValue(new Error('redis down'));
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'funnel_unavailable',
    });
    expect(hoisted.captureError).toHaveBeenCalledTimes(1);
  });
});
