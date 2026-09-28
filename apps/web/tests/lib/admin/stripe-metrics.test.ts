import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';

const listMock = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      list: (...args: unknown[]) => listMock(...args),
    },
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_mock',
  },
}));

function makeSubscription(
  overrides: Partial<Stripe.Subscription> & {
    items: Stripe.Subscription['items'];
  }
): Stripe.Subscription {
  return {
    id: overrides.id ?? 'sub_test',
    status: overrides.status ?? 'active',
    created: overrides.created ?? 0,
    ended_at: overrides.ended_at ?? null,
    canceled_at: overrides.canceled_at ?? null,
    cancel_at: overrides.cancel_at ?? null,
    items: overrides.items,
  } as Stripe.Subscription;
}

describe('getAdminStripeOverviewMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-31T12:00:00Z'));
  });

  afterEach(() => {
    listMock.mockReset();
    vi.useRealTimers();
  });

  it('computes current MRR, 30-day MRR, and active subscribers', async () => {
    const itemsA = {
      data: [
        {
          price: {
            currency: 'usd',
            unit_amount: 1000,
            recurring: { interval: 'month', interval_count: 1 },
          },
          quantity: 1,
        },
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>;

    const itemsB = {
      data: [
        {
          price: {
            currency: 'usd',
            unit_amount: 2000,
            recurring: { interval: 'month', interval_count: 1 },
          },
          quantity: 1,
        },
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>;

    const itemsC = {
      data: [
        {
          price: {
            currency: 'usd',
            unit_amount: 5000,
            recurring: { interval: 'month', interval_count: 1 },
          },
          quantity: 1,
        },
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>;

    const thirtyDaysAgoSeconds = Math.floor(
      (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
    );

    const subscriptions = [
      makeSubscription({
        id: 'sub_a',
        status: 'active',
        created: thirtyDaysAgoSeconds - 10 * 24 * 60 * 60,
        items: itemsA,
      }),
      makeSubscription({
        id: 'sub_b',
        status: 'trialing',
        created: thirtyDaysAgoSeconds + 2 * 24 * 60 * 60,
        items: itemsB,
      }),
      makeSubscription({
        id: 'sub_c',
        status: 'canceled',
        created: thirtyDaysAgoSeconds - 60 * 24 * 60 * 60,
        ended_at: thirtyDaysAgoSeconds - 10 * 24 * 60 * 60,
        items: itemsC,
      }),
    ];

    listMock.mockResolvedValue({
      data: subscriptions,
      has_more: false,
    });

    const metrics = await getAdminStripeOverviewMetrics();

    expect(metrics.mrrUsd).toBe(30);
    expect(metrics.mrrUsd30dAgo).toBe(10);
    expect(metrics.mrrGrowth30dUsd).toBe(20);
    expect(metrics.activeSubscribers).toBe(2);
    expect(metrics.isConfigured).toBe(true);
    expect(metrics.isAvailable).toBe(true);
    expect(metrics.errorMessage).toBeUndefined();
  });

  it('builds a 7-day baseline net of churn for week-over-week', async () => {
    const monthly = (cents: number) =>
      ({
        data: [
          {
            price: {
              currency: 'usd',
              unit_amount: cents,
              recurring: { interval: 'month', interval_count: 1 },
            },
            quantity: 1,
          },
        ],
      }) as Stripe.ApiList<Stripe.SubscriptionItem>;
    const day = 24 * 60 * 60;
    const nowSeconds = Math.floor(Date.now() / 1000);

    listMock.mockResolvedValue({
      data: [
        makeSubscription({
          id: 'steady',
          status: 'active',
          created: nowSeconds - 40 * day,
          items: monthly(1000),
        }),
        makeSubscription({
          id: 'new-this-week',
          status: 'active',
          created: nowSeconds - 3 * day,
          items: monthly(2000),
        }),
        makeSubscription({
          id: 'churned-this-week',
          status: 'canceled',
          created: nowSeconds - 40 * day,
          ended_at: nowSeconds - 2 * day,
          items: monthly(500),
        }),
      ],
      has_more: false,
    });

    const metrics = await getAdminStripeOverviewMetrics();

    expect(metrics.mrrUsd).toBe(30);
    expect(metrics.mrrUsd7dAgo).toBe(15);
    expect(metrics.activeSubscribers).toBe(2);
    expect(metrics.activeSubscribers7dAgo).toBe(2);
  });

  it('subtracts percentage coupon discount from MRR (JOV-1089)', async () => {
    const items = {
      data: [
        {
          price: {
            currency: 'usd',
            unit_amount: 2000, // $20/mo gross
            recurring: { interval: 'month', interval_count: 1 },
          },
          quantity: 1,
        },
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>;

    const thirtyDaysAgoSeconds = Math.floor(
      (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
    );

    const subscriptions = [
      {
        ...makeSubscription({
          id: 'sub_discounted',
          status: 'active',
          created: thirtyDaysAgoSeconds - 10 * 24 * 60 * 60,
          items,
        }),
        discounts: [
          { source: { coupon: { percent_off: 50 }, type: 'coupon' } },
        ],
      } as unknown as Stripe.Subscription,
    ];

    listMock.mockResolvedValue({ data: subscriptions, has_more: false });

    const metrics = await getAdminStripeOverviewMetrics();

    // $20 gross - 50% = $10 net MRR
    expect(metrics.mrrUsd).toBe(10);
    expect(metrics.activeSubscribers).toBe(1);
  });

  it('subtracts fixed amount coupon discount from MRR (JOV-1089)', async () => {
    const items = {
      data: [
        {
          price: {
            currency: 'usd',
            unit_amount: 2000, // $20/mo gross
            recurring: { interval: 'month', interval_count: 1 },
          },
          quantity: 1,
        },
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>;

    const thirtyDaysAgoSeconds = Math.floor(
      (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
    );

    const subscriptions = [
      {
        ...makeSubscription({
          id: 'sub_fixed_discount',
          status: 'active',
          created: thirtyDaysAgoSeconds - 10 * 24 * 60 * 60,
          items,
        }),
        discounts: [
          {
            source: {
              coupon: { amount_off: 500, currency: 'usd' },
              type: 'coupon',
            },
          },
        ],
      } as unknown as Stripe.Subscription,
    ];

    listMock.mockResolvedValue({ data: subscriptions, has_more: false });

    const metrics = await getAdminStripeOverviewMetrics();

    // $20 gross - $5 fixed = $15 net MRR
    expect(metrics.mrrUsd).toBe(15);
    expect(metrics.activeSubscribers).toBe(1);
  });

  it('excludes internal/test customers when a classifier is provided (JOV-6673)', async () => {
    const items = {
      data: [
        {
          price: {
            currency: 'usd',
            unit_amount: 19900,
            recurring: { interval: 'month', interval_count: 1 },
          },
          quantity: 1,
        },
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>;

    const thirtyDaysAgoSeconds = Math.floor(
      (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
    );

    const subscriptions = [
      {
        ...makeSubscription({
          id: 'sub_internal',
          status: 'active',
          created: thirtyDaysAgoSeconds - 10 * 24 * 60 * 60,
          items,
        }),
        customer: { id: 'cus_internal', email: 'tim@jov.ie' },
      } as unknown as Stripe.Subscription,
      {
        ...makeSubscription({
          id: 'sub_external',
          status: 'active',
          created: thirtyDaysAgoSeconds - 5 * 24 * 60 * 60,
          items,
        }),
        customer: { id: 'cus_real', email: 'artist@band.com' },
      } as unknown as Stripe.Subscription,
    ];

    listMock.mockResolvedValue({ data: subscriptions, has_more: false });

    const metrics = await getAdminStripeOverviewMetrics({
      isInternalCustomer: ({ email }) => email?.endsWith('@jov.ie') ?? false,
    });

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expand: expect.arrayContaining(['data.customer']),
      })
    );
    expect(metrics.activeSubscribers).toBe(1);
    expect(metrics.mrrUsd).toBe(199);
    expect(metrics.excludedInternalSubscribers).toBe(1);
    expect(metrics.excludedInternalMrrUsd).toBe(199);
    expect(metrics.activeSubscribers7dAgo).toBe(1);
    expect(metrics.mrrUsd7dAgo).toBe(199);
  });

  it('returns isAvailable false when Stripe API fails', async () => {
    listMock.mockRejectedValueOnce(new Error('Stripe API error'));

    const metrics = await getAdminStripeOverviewMetrics();

    expect(metrics.mrrUsd).toBe(0);
    expect(metrics.activeSubscribers).toBe(0);
    expect(metrics.isConfigured).toBe(true);
    expect(metrics.isAvailable).toBe(false);
    expect(metrics.errorMessage).toContain('Stripe API error');
  });
});
