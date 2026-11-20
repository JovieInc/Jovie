import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbSelectRows: [] as Array<Record<string, unknown>>,
  retrieveSub: vi.fn(),
  updateBilling: vi.fn(),
  fetchByIdentity: vi.fn(),
  applyBillingUpdate: vi.fn(),
  admitPaidUser: vi.fn(),
  activateReferral: vi.fn(),
  expireReferral: vi.fn(),
  recordCommission: vi.fn(),
  enqueuePaidWelcome: vi.fn(),
  attributeLeadPaid: vi.fn(),
  recordOfferStage: vi.fn(),
  markClaimPaid: vi.fn(),
  trackServerEvent: vi.fn(),
  sendDunning: vi.fn(),
  sendRecovery: vi.fn(),
  notifyUpgrade: vi.fn(),
  notifyCancel: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
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
vi.mock('@/lib/stripe/customer-sync/queries', () => ({
  fetchUserBillingDataByIdentity: mocks.fetchByIdentity,
}));
vi.mock('@/lib/db/billing-status', () => ({
  applyBillingUpdateWithAudit: mocks.applyBillingUpdate,
}));
vi.mock('@/lib/waitlist/paid-admission', () => ({
  admitPaidUser: mocks.admitPaidUser,
}));
vi.mock('@/lib/referrals/service', () => ({
  activateReferral: mocks.activateReferral,
  expireReferralOnChurn: mocks.expireReferral,
  recordCommission: mocks.recordCommission,
}));
vi.mock('@/lib/email/paid-welcome', () => ({
  enqueuePaidWelcomeAfterEntitlement: mocks.enqueuePaidWelcome,
}));
vi.mock('@/lib/leads/funnel-events', () => ({
  attributeLeadPaidConversionByAppUserId: mocks.attributeLeadPaid,
}));
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: mocks.recordOfferStage,
}));
vi.mock('@/lib/claim/claim-verification.server', () => ({
  markClaimVerificationsPaid: mocks.markClaimPaid,
}));
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mocks.trackServerEvent,
}));
vi.mock('@/lib/stripe/dunning', () => ({
  shouldSendDunningEmail: () => true,
  sendPaymentFailedEmail: mocks.sendDunning,
  sendPaymentRecoveredEmail: mocks.sendRecovery,
}));
vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackUpgrade: mocks.notifyUpgrade,
  notifySlackCancellation: mocks.notifyCancel,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  captureWarning: vi.fn(),
  logFallback: vi.fn(),
}));
vi.mock('@/lib/observability/revenue-spine', () => ({
  captureRevenueSpineFailure: vi.fn(),
}));

describe('Stripe webhooks: Better Auth UUID fallback, expanded customer, skipped suppression, and 3DS activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbSelectRows = [];
    mocks.trackServerEvent.mockResolvedValue({ ok: true });
    mocks.sendDunning.mockResolvedValue(undefined);
    mocks.sendRecovery.mockResolvedValue(undefined);
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

  it('handles expanded Stripe.Customer objects and suppresses side effects when skipped', async () => {
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
      reason: 'Stripe event already applied',
    });

    const { CheckoutSessionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/checkout-handler'
    );
    const handler = new CheckoutSessionHandler();
    const res = await handler.handle({
      event: {
        id: 'evt_dup',
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
      stripeEventId: 'evt_dup',
      stripeEventTimestamp: new Date(),
    });

    expect(res.skipped).toBe(true);
    expect(mocks.admitPaidUser).not.toHaveBeenCalled();
    expect(mocks.enqueuePaidWelcome).not.toHaveBeenCalled();
    expect(mocks.attributeLeadPaid).not.toHaveBeenCalled();
    expect(mocks.markClaimPaid).not.toHaveBeenCalled();
  });

  it('runs claim-paid, referral, and offer-stage transitions on 3DS subscription.updated -> active', async () => {
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
        },
      } as unknown as Stripe.Event,
      stripeEventId: 'evt_3ds_active',
      stripeEventTimestamp: new Date('2026-11-20T05:00:00Z'),
    });

    expect(mocks.admitPaidUser).toHaveBeenCalledOnce();
    expect(mocks.activateReferral).toHaveBeenCalledWith('ba-user-uuid-2');
    expect(mocks.recordOfferStage).toHaveBeenCalledWith(
      '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
      'paid',
      new Date('2026-11-20T05:00:00Z')
    );
    expect(mocks.markClaimPaid).toHaveBeenCalledWith({
      appUserId: 'ba-user-uuid-2',
      paidAt: new Date('2026-11-20T05:00:00Z'),
      acquisitionId: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
    });
  });

  it('skips downgrade when expectedSubscriptionId does not match active replacement subscription', async () => {
    mocks.fetchByIdentity.mockResolvedValue({
      success: true,
      data: {
        id: 'ba-user-uuid-3',
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_3',
        stripeSubscriptionId: 'sub_replacement_new',
        stripePriceId: 'price_pro_monthly',
        billingVersion: 2,
        lastBillingEventAt: new Date('2026-11-20T04:00:00Z'),
      },
    });

    const { updateUserBillingStatus } = await import(
      '@/lib/stripe/customer-sync/update-status'
    );
    const result = await updateUserBillingStatus({
      clerkUserId: 'ba-user-uuid-3',
      isPro: false,
      stripeSubscriptionId: null,
      expectedSubscriptionId: 'sub_canceled_old',
      stripePriceId: null,
      stripeEventId: 'evt_old_cancel',
      stripeEventTimestamp: new Date('2026-11-20T05:00:00Z'),
      eventType: 'subscription_deleted',
    });

    expect(result).toEqual({
      success: true,
      appUserId: 'ba-user-uuid-3',
      skipped: true,
      reason: 'Active subscription replaced before downgrade',
    });
    expect(mocks.applyBillingUpdate).not.toHaveBeenCalled();
  });
});
