import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  '@/app/api/internal/ovie/summer-company/funnel/route'
);

const URL = 'https://jov.ie/api/internal/ovie/summer-company/funnel';

describe('GET /api/internal/ovie/summer-company/funnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 without reading the funnel when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(hoisted.cache).not.toHaveBeenCalled();
  });

  it('returns the aggregate uncached', async () => {
    const body = {
      contractVersion: 'summer-funnel/v2',
      observedAt: '2026-09-26T12:00:00.000Z',
      windows: {},
    };
    hoisted.cache.mockResolvedValue({
      snapshot: { sourcePayloads: { signupFunnel: body } },
    });
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(body);
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
