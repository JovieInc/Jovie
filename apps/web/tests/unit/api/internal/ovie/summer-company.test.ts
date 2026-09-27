import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  revenue: vi.fn(),
  cohort: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/ovie/summer-company.server', async () => {
  const { z } = await import('zod');
  return {
    getSummerRevenue: hoisted.revenue,
    getSummerCohort: hoisted.cohort,
    summerCohortQuerySchema: z.object({
      kind: z.enum(['claimed_artists', 'checkout_abandoned', 'churned']),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  };
});
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const revenueRoute = await import(
  '@/app/api/internal/ovie/summer-company/revenue/route'
);
const cohortsRoute = await import(
  '@/app/api/internal/ovie/summer-company/cohorts/route'
);

const BASE = 'https://jov.ie/api/internal/ovie/summer-company';

describe('GET /api/internal/ovie/summer-company/revenue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 without reading revenue when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await revenueRoute.GET(new Request(`${BASE}/revenue`));
    expect(response.status).toBe(401);
    expect(hoisted.revenue).not.toHaveBeenCalled();
  });

  it('returns revenue, including unavailable providers, uncached', async () => {
    const body = {
      observedAt: '2026-09-26T12:00:00.000Z',
      jovie: { status: 'unavailable', reason: 'stripe_request_failed' },
      lyb: { state: 'unavailable' },
    };
    hoisted.revenue.mockResolvedValue(body);
    const response = await revenueRoute.GET(new Request(`${BASE}/revenue`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(body);
  });

  it('fails closed with 503', async () => {
    hoisted.revenue.mockRejectedValue(new Error('boom'));
    const response = await revenueRoute.GET(new Request(`${BASE}/revenue`));
    expect(response.status).toBe(503);
  });
});

describe('GET /api/internal/ovie/summer-company/cohorts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await cohortsRoute.GET(
      new Request(`${BASE}/cohorts?kind=churned`)
    );
    expect(response.status).toBe(401);
    expect(hoisted.cohort).not.toHaveBeenCalled();
  });

  it.each(['kind=lyb_weight', 'kind=churned&limit=201', ''])(
    'rejects %s with 400',
    async query => {
      const response = await cohortsRoute.GET(
        new Request(`${BASE}/cohorts?${query}`)
      );
      expect(response.status).toBe(400);
    }
  );

  it('returns the cohort with kind and observedAt', async () => {
    hoisted.cohort.mockResolvedValue({
      total: 1,
      rows: [{ id: 'u1', displayName: 'Ada' }],
    });
    const response = await cohortsRoute.GET(
      new Request(`${BASE}/cohorts?kind=churned&limit=5`)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      kind: 'churned',
      total: 1,
      rows: [{ id: 'u1', displayName: 'Ada' }],
    });
    expect(Date.parse(body.observedAt)).not.toBeNaN();
    expect(hoisted.cohort).toHaveBeenCalledWith('churned', 5, expect.any(Date));
  });

  it('passes an unavailable source through instead of a fake empty cohort', async () => {
    hoisted.cohort.mockResolvedValue({
      status: 'unavailable',
      reason: 'stripe_not_configured',
    });
    const response = await cohortsRoute.GET(
      new Request(`${BASE}/cohorts?kind=checkout_abandoned`)
    );
    const body = await response.json();
    expect(body).toMatchObject({
      kind: 'checkout_abandoned',
      status: 'unavailable',
      reason: 'stripe_not_configured',
    });
    expect(body).not.toHaveProperty('rows');
  });

  it('fails closed with 503 when the query throws', async () => {
    hoisted.cohort.mockRejectedValue(new Error('db down'));
    const response = await cohortsRoute.GET(
      new Request(`${BASE}/cohorts?kind=claimed_artists`)
    );
    expect(response.status).toBe(503);
  });
});
