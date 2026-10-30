import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  metrics: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/billing/price-changes/metrics.server', () => ({
  getPriceChangeNoticeMetrics: hoisted.metrics,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const route = await import(
  '@/app/api/internal/ovie/summer-company/price-changes/route'
);
const URL_ = 'https://jov.ie/api/internal/ovie/summer-company/price-changes';

describe('GET /api/internal/ovie/summer-company/price-changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 without reading metrics when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await route.GET(new Request(URL_));
    expect(response.status).toBe(401);
    expect(hoisted.metrics).not.toHaveBeenCalled();
  });

  it('returns the notice metrics uncached', async () => {
    const body = { changes: 1, scheduled: 3, sent: 2, failed: 1 };
    hoisted.metrics.mockResolvedValue(body);
    const response = await route.GET(new Request(URL_));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(body);
  });

  it('fails closed with 503', async () => {
    hoisted.metrics.mockRejectedValue(new Error('boom'));
    const response = await route.GET(new Request(URL_));
    expect(response.status).toBe(503);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});
