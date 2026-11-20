import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admitPaidUser: vi.fn(),
  activateReferral: vi.fn(),
  enqueuePaidWelcome: vi.fn(),
  attributeLeadPaid: vi.fn(),
  recordOfferStage: vi.fn(),
  markClaimPaid: vi.fn(),
  fetchByIdentity: vi.fn(),
  applyBillingUpdate: vi.fn(),
}));

vi.mock('@/lib/waitlist/paid-admission', () => ({
  admitPaidUser: mocks.admitPaidUser,
}));
vi.mock('@/lib/referrals/service', () => ({
  activateReferral: mocks.activateReferral,
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
vi.mock('@/lib/stripe/customer-sync/queries', () => ({
  fetchUserBillingDataByIdentity: mocks.fetchByIdentity,
}));
vi.mock('@/lib/db/billing-status', () => ({
  applyBillingUpdateWithAudit: mocks.applyBillingUpdate,
}));

describe('post-activation side effects & subscription replacement guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admitPaidUser.mockResolvedValue(undefined);
    mocks.activateReferral.mockResolvedValue(undefined);
    mocks.attributeLeadPaid.mockResolvedValue(undefined);
    mocks.recordOfferStage.mockResolvedValue(true);
    mocks.markClaimPaid.mockResolvedValue(undefined);
  });

  it('executes paid admission, referral, welcome email, lead attribution, offer stage, and claim-paid', async () => {
    const { runActiveSubscriptionPostEffects } = await import(
      '@/lib/stripe/webhooks/post-activation'
    );
    const ts = new Date('2026-11-20T05:00:00Z');
    await runActiveSubscriptionPostEffects({
      appUserId: 'ba-user-uuid-2',
      userId: 'ba-user-uuid-2',
      subscription: { id: 'sub_3ds' } as Stripe.Subscription,
      plan: 'pro',
      acquisitionId: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
      stripeEventTimestamp: ts,
      eventName: 'customer.subscription.updated',
    });

    expect(mocks.admitPaidUser).toHaveBeenCalledWith({
      appUserId: 'ba-user-uuid-2',
      cacheKeys: ['ba-user-uuid-2'],
    });
    expect(mocks.activateReferral).toHaveBeenCalledWith('ba-user-uuid-2');
    expect(mocks.enqueuePaidWelcome).toHaveBeenCalledOnce();
    expect(mocks.attributeLeadPaid).toHaveBeenCalledWith(
      'ba-user-uuid-2',
      'sub_3ds',
      undefined
    );
    expect(mocks.recordOfferStage).toHaveBeenCalledWith(
      '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
      'paid',
      ts
    );
    expect(mocks.markClaimPaid).toHaveBeenCalledWith({
      appUserId: 'ba-user-uuid-2',
      paidAt: ts,
      acquisitionId: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
    });
  });

  it('completes idempotent DB post-effects without re-sending welcome email when skipWelcomeEmail is true', async () => {
    const {
      canCompleteIdempotentPostEffects,
      runActiveSubscriptionPostEffects,
    } = await import('@/lib/stripe/webhooks/post-activation');
    const ts = new Date('2026-11-20T05:00:00Z');

    expect(
      canCompleteIdempotentPostEffects({
        success: true,
        skipped: true,
        skipReason: 'duplicate_event',
      })
    ).toBe(true);
    expect(
      canCompleteIdempotentPostEffects({
        success: true,
        skipped: true,
        skipReason: 'stale_event',
      })
    ).toBe(false);
    expect(
      canCompleteIdempotentPostEffects({
        success: true,
        skipped: true,
        skipReason: 'subscription_mismatch',
      })
    ).toBe(false);

    const { canRecordInvoiceKeyedCommission } = await import(
      '@/lib/stripe/webhooks/post-activation'
    );
    expect(
      canRecordInvoiceKeyedCommission({
        success: true,
        skipped: true,
        skipReason: 'stale_event',
      })
    ).toBe(true);
    expect(
      canRecordInvoiceKeyedCommission({
        success: true,
        skipped: true,
        skipReason: 'subscription_mismatch',
      })
    ).toBe(false);

    await runActiveSubscriptionPostEffects({
      appUserId: 'ba-user-uuid-retry',
      userId: 'ba-user-uuid-retry',
      subscription: { id: 'sub_retry' } as Stripe.Subscription,
      plan: 'pro',
      acquisitionId: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
      stripeEventTimestamp: ts,
      skipWelcomeEmail: true,
      eventName: 'checkout.session.completed',
    });

    expect(mocks.admitPaidUser).toHaveBeenCalledOnce();
    expect(mocks.activateReferral).toHaveBeenCalledWith('ba-user-uuid-retry');
    expect(mocks.enqueuePaidWelcome).not.toHaveBeenCalled();
    expect(mocks.attributeLeadPaid).toHaveBeenCalledOnce();
    expect(mocks.recordOfferStage).toHaveBeenCalledOnce();
    expect(mocks.markClaimPaid).toHaveBeenCalledOnce();
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
      skipReason: 'subscription_mismatch',
      reason: 'Active subscription replaced before downgrade',
    });
    expect(mocks.applyBillingUpdate).not.toHaveBeenCalled();
  });
});
