import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbSelectRows: [] as Array<Record<string, unknown>>,
  retrieveSub: vi.fn(),
  updateBilling: vi.fn(),
  runPostEffects: vi.fn(),
  trackServerEvent: vi.fn(),
  notifyUpgrade: vi.fn(),
  notifyCancel: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => mocks.dbSelectRows }),
        leftJoin: () => ({
          where: () => ({ limit: async () => mocks.dbSelectRows }),
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/stripe/client', () => ({
  stripe: { subscriptions: { retrieve: mocks.retrieveSub } },
}));
vi.mock('@/lib/stripe/subscription-plan', () => ({
  subscriptionPriceIds: () => ['price_pro_monthly'],
  resolvePlanFromPriceIds: () => ({
    priceId: 'price_pro_monthly',
    plan: 'pro',
  }),
}));
vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mocks.updateBilling,
}));
vi.mock('@/lib/stripe/webhooks/post-activation', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/lib/stripe/webhooks/post-activation')
    >();
  return {
    ...actual,
    runActiveSubscriptionPostEffects: mocks.runPostEffects,
  };
});
vi.mock('@/lib/referrals/service', () => ({
  activateReferral: vi.fn(),
  expireReferralOnChurn: vi.fn(),
  recordCommission: vi.fn(),
}));
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mocks.trackServerEvent,
}));
vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackUpgrade: mocks.notifyUpgrade,
  notifySlackCancellation: mocks.notifyCancel,
}));

describe('Stripe webhooks: Better Auth UUID fallback, expanded customer, skipped suppression, and 3DS activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbSelectRows = [];
    mocks.runPostEffects.mockResolvedValue(undefined);
    mocks.trackServerEvent.mockResolvedValue({ ok: true });
    mocks.notifyUpgrade.mockResolvedValue(undefined);
    mocks.notifyCancel.mockResolvedValue(undefined);
  });

  it('resolves Better Auth UUID from Stripe customer when users.clerkId is null', async () => {
    mocks.dbSelectRows = [{ id: 'ba-user-uuid-1', clerkId: null }];
    const { getUserIdFromStripeCustomer } = await import(
      '@/lib/stripe/webhooks/utils'
    );
    await expect(getUserIdFromStripeCustomer('cus_ba_1')).resolves.toBe(
      'ba-user-uuid-1'
    );
  });

  it('handles expanded Stripe.Customer objects and suppresses side effects when stale or mismatched', async () => {
    mocks.dbSelectRows = [{ id: 'ba-user-uuid-1', clerkId: null }];
    mocks.retrieveSub.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      customer: { id: 'cus_ba_1', object: 'customer' },
      metadata: { acquisition_id: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f' },
      items: { data: [{ price: { id: 'price_pro_monthly' } }] },
    });
    mocks.updateBilling.mockResolvedValue({
      success: true,
      appUserId: 'ba-user-uuid-1',
      skipped: true,
      skipReason: 'stale_event',
      reason: 'Event is older than last processed event',
    });

    const { CheckoutSessionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/checkout-handler'
    );
    const handler = new CheckoutSessionHandler();
    const res = await handler.handle({
      event: {
        id: 'evt_stale',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_1',
            customer: { id: 'cus_ba_1', object: 'customer' },
            subscription: 'sub_1',
            metadata: {},
          },
        },
      } as unknown as Stripe.Event,
      stripeEventId: 'evt_stale',
      stripeEventTimestamp: new Date('2026-11-20T05:00:00Z'),
    });

    expect(res.skipped).toBe(true);
    expect(mocks.runPostEffects).not.toHaveBeenCalled();
    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });

  it('completes idempotent post-activation effects on duplicate_event retry after a transient failure and still enqueues welcome email', async () => {
    mocks.dbSelectRows = [{ id: 'ba-user-uuid-retry', clerkId: null }];
    mocks.retrieveSub.mockResolvedValue({
      id: 'sub_retry_1',
      status: 'active',
      customer: { id: 'cus_ba_retry', object: 'customer' },
      metadata: { acquisition_id: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f' },
      items: { data: [{ price: { id: 'price_pro_monthly' } }] },
    });

    // Attempt 1: billing update + audit log commit, then post-effects fail transiently.
    mocks.updateBilling
      .mockResolvedValueOnce({
        success: true,
        appUserId: 'ba-user-uuid-retry',
        skipped: false,
      })
      // Attempt 2 (Stripe redelivery of same stripe_event_id): audit row exists -> duplicate_event.
      .mockResolvedValueOnce({
        success: true,
        appUserId: 'ba-user-uuid-retry',
        skipped: true,
        skipReason: 'duplicate_event',
        reason: 'Stripe event already applied',
      });

    mocks.runPostEffects
      .mockRejectedValueOnce(new Error('transient neon timeout'))
      .mockResolvedValueOnce(undefined);

    const { CheckoutSessionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/checkout-handler'
    );
    const handler = new CheckoutSessionHandler();
    const ctx = {
      event: {
        id: 'evt_transient_post_effect',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_retry_1',
            customer: { id: 'cus_ba_retry', object: 'customer' },
            subscription: 'sub_retry_1',
            metadata: {
              acquisition_id: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
            },
          },
        },
      } as unknown as Stripe.Event,
      stripeEventId: 'evt_transient_post_effect',
      stripeEventTimestamp: new Date('2026-11-20T05:00:00Z'),
    };

    await expect(handler.handle(ctx)).rejects.toThrow('transient neon timeout');
    expect(mocks.runPostEffects).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        appUserId: 'ba-user-uuid-retry',
      })
    );
    expect(mocks.runPostEffects.mock.calls[0]?.[0]?.skipWelcomeEmail).not.toBe(
      true
    );

    const retryRes = await handler.handle(ctx);
    expect(retryRes.success).toBe(true);
    expect(retryRes.skipped).toBe(true);
    expect(mocks.runPostEffects).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        appUserId: 'ba-user-uuid-retry',
      })
    );
    expect(mocks.runPostEffects.mock.calls[1]?.[0]?.skipWelcomeEmail).not.toBe(
      true
    );
  });

  it('delegates 3DS subscription.updated -> active to runActiveSubscriptionPostEffects', async () => {
    mocks.dbSelectRows = [{ id: 'ba-user-uuid-2', clerkId: null }];
    mocks.updateBilling.mockResolvedValue({
      success: true,
      appUserId: 'ba-user-uuid-2',
      skipped: false,
    });

    const { SubscriptionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    const handler = new SubscriptionHandler();
    const ts = new Date('2026-11-20T05:00:00Z');
    await handler.handle({
      event: {
        id: 'evt_3ds_active',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_3ds',
            status: 'active',
            customer: { id: 'cus_ba_2', object: 'customer' },
            metadata: {
              acquisition_id: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
            },
            items: { data: [{ price: { id: 'price_pro_monthly' } }] },
          },
          previous_attributes: { status: 'incomplete' },
        },
      } as unknown as Stripe.Event,
      stripeEventId: 'evt_3ds_active',
      stripeEventTimestamp: ts,
    });

    expect(mocks.runPostEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        appUserId: 'ba-user-uuid-2',
        userId: 'ba-user-uuid-2',
        correlation: expect.objectContaining({
          acquisitionId: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
        }),
        stripeEventTimestamp: ts,
        eventName: 'customer.subscription.updated',
        priorSubscriptionStatus: 'incomplete',
      })
    );
  });

  it('does not mark claims paid on unrelated active subscription updates', async () => {
    mocks.dbSelectRows = [{ id: 'ba-user-uuid-renew', clerkId: null }];
    mocks.updateBilling.mockResolvedValue({
      success: true,
      appUserId: 'ba-user-uuid-renew',
      isActive: true,
      skipped: false,
    });

    const { SubscriptionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    const handler = new SubscriptionHandler();
    await handler.handle({
      event: {
        id: 'evt_renewal',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_renew',
            status: 'active',
            customer: { id: 'cus_renew', object: 'customer' },
            metadata: { clerk_user_id: 'ba-user-uuid-renew' },
            items: { data: [{ price: { id: 'price_pro_monthly' } }] },
          },
          previous_attributes: { cancel_at_period_end: false },
        },
      } as unknown as Stripe.Event,
      stripeEventId: 'evt_renewal',
      stripeEventTimestamp: new Date('2026-11-20T05:00:00Z'),
    });

    expect(mocks.runPostEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        priorSubscriptionStatus: undefined,
      })
    );
  });

  it('suppresses subscription post-effects when skipReason is subscription_mismatch', async () => {
    mocks.dbSelectRows = [{ id: 'ba-user-uuid-mismatch', clerkId: null }];
    mocks.updateBilling.mockResolvedValue({
      success: true,
      appUserId: 'ba-user-uuid-mismatch',
      skipped: true,
      skipReason: 'subscription_mismatch',
      reason: 'Subscription sub_old does not match active sub_current',
    });

    const { SubscriptionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    const handler = new SubscriptionHandler();
    await handler.handle({
      event: {
        id: 'evt_sub_mismatch',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_old',
            status: 'active',
            customer: { id: 'cus_ba_mismatch', object: 'customer' },
            metadata: {},
            items: { data: [{ price: { id: 'price_pro_monthly' } }] },
          },
        },
      } as unknown as Stripe.Event,
      stripeEventId: 'evt_sub_mismatch',
      stripeEventTimestamp: new Date('2026-11-20T05:00:00Z'),
    });

    expect(mocks.runPostEffects).not.toHaveBeenCalled();
  });
});
