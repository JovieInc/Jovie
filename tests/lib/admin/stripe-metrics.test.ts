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
  });
});
