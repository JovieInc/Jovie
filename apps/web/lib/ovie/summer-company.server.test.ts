import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  stripeMetrics: vi.fn(),
  lybMrr: vi.fn(),
  sessionsList: vi.fn(),
  dbResults: [] as unknown[],
  env: { STRIPE_SECRET_KEY: 'sk_test_x' as string | undefined },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/admin/stripe-metrics', () => ({
  getAdminStripeOverviewMetrics: hoisted.stripeMetrics,
}));
vi.mock('./lyb-mrr.server', () => ({ getLybDailyMrr: hoisted.lybMrr }));
vi.mock('@/lib/env-server', () => ({ env: hoisted.env }));
vi.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { list: hoisted.sessionsList } } },
}));
vi.mock('@/constants/domains', () => ({
  getProfileUrl: (handle: string) => `https://jov.ie/${handle}`,
}));
vi.mock('@/lib/db', () => {
  // Every builder method chains; awaiting a query yields the next queued result.
  const query = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, property) {
          if (property === 'then') {
            const result = hoisted.dbResults.shift();
            return (resolve: (value: unknown) => void) => resolve(result);
          }
          return () => query();
        },
      }
    );
  return { db: { select: () => query() } };
});

const { getSummerCohort, getSummerRevenue } = await import(
  './summer-company.server'
);

const NOW = new Date('2026-09-26T12:00:00.000Z');
const lybRecord = { schema: 'jovie.lyb-daily-mrr/v1', state: 'unavailable' };

describe('getSummerRevenue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.dbResults.length = 0;
    hoisted.lybMrr.mockResolvedValue(lybRecord);
  });

  it('reports Jovie Stripe MRR and passes the LYB record through', async () => {
    hoisted.dbResults.push([]); // internal stripe customer ids
    hoisted.stripeMetrics.mockResolvedValue({
      mrrUsd: 120,
      activeSubscribers: 3,
      excludedInternalSubscribers: 1,
      excludedInternalMrrUsd: 199,
      isConfigured: true,
      isAvailable: true,
    });
    await expect(getSummerRevenue(NOW)).resolves.toEqual({
      observedAt: NOW.toISOString(),
      jovie: {
        metricScope: 'customer_only',
        mrrUsd: 120,
        activeSubscriptions: 3,
        excludedInternal: 1,
        excludedInternalMrrUsd: 199,
        rawMrrUsd: 319,
        rawActiveSubscriptions: 4,
        syntheticHealth: { mrrUsd: 199, activeSubscriptions: 1 },
        source: 'stripe',
      },
      lyb: lybRecord,
    });
  });

  it('passes an internal-customer classifier to the Stripe metrics read', async () => {
    hoisted.dbResults.push([
      { stripeCustomerId: 'cus_internal' },
      { stripeCustomerId: null },
    ]);
    hoisted.stripeMetrics.mockResolvedValue({
      mrrUsd: 0,
      activeSubscribers: 0,
      excludedInternalSubscribers: 1,
      excludedInternalMrrUsd: 199,
      isConfigured: true,
      isAvailable: true,
    });
    await getSummerRevenue(NOW);
    const { isInternalCustomer } = hoisted.stripeMetrics.mock.calls[0][0];
    expect(isInternalCustomer({ id: 'cus_internal', email: null })).toBe(true);
    expect(isInternalCustomer({ id: 'cus_ext', email: 'tim@jov.ie' })).toBe(
      true
    );
    expect(
      isInternalCustomer({ id: 'cus_ext2', email: 'e2e-1@example.com' })
    ).toBe(true);
    expect(
      isInternalCustomer({ id: 'cus_real', email: 'artist@band.com' })
    ).toBe(false);
  });

  it.each([
    [{ isConfigured: false, isAvailable: false }, 'stripe_not_configured'],
    [{ isConfigured: true, isAvailable: false }, 'stripe_request_failed'],
  ])(
    'never reports a fake zero when Stripe cannot answer',
    async (metrics, reason) => {
      hoisted.dbResults.push([]);
      hoisted.stripeMetrics.mockResolvedValue({
        mrrUsd: 0,
        activeSubscribers: 0,
        ...metrics,
      });
      const revenue = await getSummerRevenue(NOW);
      expect(revenue.jovie).toEqual({ status: 'unavailable', reason });
    }
  );

  it('marks LYB unavailable when its read throws', async () => {
    hoisted.dbResults.push([]);
    hoisted.stripeMetrics.mockResolvedValue({
      mrrUsd: 1,
      activeSubscribers: 1,
      isConfigured: true,
      isAvailable: true,
    });
    hoisted.lybMrr.mockRejectedValue(new Error('boom'));
    const revenue = await getSummerRevenue(NOW);
    expect(revenue.lyb).toEqual({
      status: 'unavailable',
      reason: 'lyb_mrr_failed',
    });
  });
});

describe('getSummerCohort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.dbResults.length = 0;
    hoisted.env.STRIPE_SECRET_KEY = 'sk_test_x';
  });

  it('lists claimed artists with profile links and a total', async () => {
    hoisted.dbResults.push(
      [
        {
          id: 'p1',
          username: 'tim',
          displayName: null,
          email: 'tim@example.com',
          claimedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ],
      [{ total: 7 }],
      [{ total: 50 }]
    );
    await expect(getSummerCohort('claimed_artists', 10)).resolves.toEqual({
      metricScope: 'customer_only',
      total: 7,
      excludedInternal: 50,
      customerTotal: 7,
      rawTotal: 57,
      syntheticHealth: { total: 50 },
      rows: [
        {
          id: 'p1',
          displayName: 'tim',
          profileUrl: 'https://jov.ie/tim',
          email: 'tim@example.com',
          detail: 'claimed 2026-09-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('lists churned users with their cancellation time', async () => {
    hoisted.dbResults.push(
      [
        {
          id: 'u1',
          name: 'Ada',
          email: null,
          cancelledAt: new Date('2026-09-10T00:00:00.000Z'),
        },
      ],
      [{ total: 1 }],
      [{ total: 2 }]
    );
    await expect(getSummerCohort('churned', 10)).resolves.toEqual({
      metricScope: 'customer_only',
      total: 1,
      excludedInternal: 2,
      customerTotal: 1,
      rawTotal: 3,
      syntheticHealth: { total: 2 },
      rows: [
        {
          id: 'u1',
          displayName: 'Ada',
          detail: 'subscription cancelled 2026-09-10T00:00:00.000Z',
        },
      ],
    });
  });

  it('is unavailable for abandoned checkouts without Stripe', async () => {
    hoisted.env.STRIPE_SECRET_KEY = undefined;
    await expect(
      getSummerCohort('checkout_abandoned', 10, NOW)
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'stripe_not_configured',
    });
    expect(hoisted.sessionsList).not.toHaveBeenCalled();
  });

  it('is unavailable when Stripe fails', async () => {
    hoisted.sessionsList.mockRejectedValue(new Error('stripe down'));
    await expect(
      getSummerCohort('checkout_abandoned', 10, NOW)
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'stripe_request_failed',
    });
  });

  it('maps expired subscription checkouts to unconverted users', async () => {
    const created = Math.floor(NOW.getTime() / 1000) - 3600;
    hoisted.sessionsList.mockResolvedValue({
      has_more: false,
      data: [
        { id: 'cs_1', mode: 'subscription', customer: 'cus_1', created },
        { id: 'cs_2', mode: 'payment', customer: 'cus_2', created },
        { id: 'cs_3', mode: 'subscription', customer: null, created },
      ],
    });
    hoisted.dbResults.push([
      {
        id: 'u1',
        name: null,
        email: 'a@band.com',
        stripeCustomerId: 'cus_1',
      },
      {
        id: 'u2',
        name: null,
        email: 'e2e-checkout@jov.ie',
        stripeCustomerId: 'cus_2',
      },
      {
        id: 'u3',
        name: null,
        email: 'qa-fan@gmail.com',
        stripeCustomerId: 'cus_2',
      },
    ]);
    const cohort = await getSummerCohort('checkout_abandoned', 10, NOW);
    expect(hoisted.sessionsList).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'expired' })
    );
    expect(cohort).toEqual({
      metricScope: 'customer_only',
      total: 1,
      excludedInternal: 2,
      customerTotal: 1,
      rawTotal: 3,
      syntheticHealth: { total: 2 },
      rows: [
        {
          id: 'u1',
          displayName: 'a@band.com',
          email: 'a@band.com',
          detail: `checkout expired ${new Date(created * 1000).toISOString()}`,
        },
      ],
    });
  });

  it('returns an empty cohort without a user query when nothing expired', async () => {
    hoisted.sessionsList.mockResolvedValue({ has_more: false, data: [] });
    await expect(
      getSummerCohort('checkout_abandoned', 10, NOW)
    ).resolves.toEqual({
      metricScope: 'customer_only',
      total: 0,
      excludedInternal: 0,
      customerTotal: 0,
      rawTotal: 0,
      syntheticHealth: { total: 0 },
      rows: [],
    });
  });
});
