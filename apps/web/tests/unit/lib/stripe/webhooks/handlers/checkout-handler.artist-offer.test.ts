/**
 * $12/month artist profile: signed Stripe checkout fixture → entitlement.
 *
 * Verifies the fixture through Stripe's own signature check, then runs the
 * real checkout handler and real price mapping (no plan mock) so a completed
 * $12 checkout must grant `pro` and record the `paid` funnel stage.
 */

import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/tests/fixtures/stripe/artist-profile-12-checkout-completed.json';

const mocks = vi.hoisted(() => ({
  retrieveSubscription: vi.fn(),
  updateUserBillingStatus: vi.fn(),
  recordStage: vi.fn(),
  attributeLead: vi.fn(),
  admitPaidUser: vi.fn(),
  markClaimVerificationsPaid: vi.fn(),
  captureCriticalError: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: { subscriptions: { retrieve: mocks.retrieveSubscription } },
}));
vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mocks.updateUserBillingStatus,
}));
vi.mock('@/lib/stripe/webhooks/utils', () => ({
  getUserIdFromStripeCustomer: vi.fn(),
  invalidateBillingCache: vi.fn(),
  isActiveSubscription: (status: string) =>
    status === 'active' || status === 'trialing',
  getCustomerId: (customer: string | { id: string } | null) =>
    typeof customer === 'string' ? customer : (customer?.id ?? null),
}));
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: mocks.recordStage,
}));
vi.mock('@/lib/claim/claim-verification.server', () => ({
  markClaimVerificationsPaid: mocks.markClaimVerificationsPaid,
}));
vi.mock('@/lib/leads/funnel-events', () => ({
  attributeLeadPaidConversionByAppUserId: mocks.attributeLead,
}));
vi.mock('@/lib/waitlist/paid-admission', () => ({
  admitPaidUser: mocks.admitPaidUser,
}));
vi.mock('@/lib/referrals/service', () => ({ activateReferral: vi.fn() }));
vi.mock('@/lib/email/paid-welcome', () => ({
  enqueuePaidWelcomeAfterEntitlement: vi.fn(),
  maybeSendPaidWelcomeAfterEntitlement: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mocks.captureCriticalError,
  logFallback: vi.fn(),
  captureError: vi.fn(),
}));

const WEBHOOK_SECRET = 'whsec_artist_profile_fixture';
const APP_USER_ID = fixture.event.data.object.metadata.clerk_user_id;

function signedFixtureEvent(): Stripe.Event {
  const stripe = new Stripe('sk_test_fixture');
  const payload = JSON.stringify(fixture.event);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return stripe.webhooks.constructEvent(payload, header, WEBHOOK_SECRET);
}

describe('$12 artist profile checkout webhook', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv(
      'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
      'price_test_artist_profile_12'
    );
    mocks.retrieveSubscription.mockResolvedValue(fixture.subscription);
    mocks.updateUserBillingStatus.mockResolvedValue({
      success: true,
      appUserId: APP_USER_ID,
    });
    mocks.admitPaidUser.mockResolvedValue({ admitted: true });
    mocks.markClaimVerificationsPaid.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects the fixture when the signature does not match', () => {
    const stripe = new Stripe('sk_test_fixture');
    const payload = JSON.stringify(fixture.event);
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_other',
    });
    expect(() =>
      stripe.webhooks.constructEvent(payload, header, WEBHOOK_SECRET)
    ).toThrow();
  });

  it('grants pro for the $12 price and records the paid stage', async () => {
    const { getPriceMappingDetails } = await import('@/lib/stripe/config');
    expect(
      getPriceMappingDetails('price_test_artist_profile_12')
    ).toMatchObject({ plan: 'pro', amount: 1200, interval: 'month' });

    const { CheckoutSessionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/checkout-handler'
    );
    const event = signedFixtureEvent();
    const timestamp = new Date(event.created * 1000);
    const result = await new CheckoutSessionHandler().handle({
      event,
      stripeEventId: event.id,
      stripeEventTimestamp: timestamp,
    });

    expect(result).toMatchObject({ success: true, isActive: true });
    expect(mocks.updateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: APP_USER_ID,
        isPro: true,
        plan: 'pro',
        stripeSubscriptionId: 'sub_test_artist_profile_12',
      })
    );
    expect(mocks.recordStage).toHaveBeenCalledWith(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      'paid',
      timestamp
    );
  });

  it('moves a high-reach claim to pending verification on payment', async () => {
    mocks.markClaimVerificationsPaid.mockResolvedValue(1);
    const { CheckoutSessionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/checkout-handler'
    );
    const event = signedFixtureEvent();
    const timestamp = new Date(event.created * 1000);
    const result = await new CheckoutSessionHandler().handle({
      event,
      stripeEventId: event.id,
      stripeEventTimestamp: timestamp,
    });

    // Payment still succeeds; only the claim waits for verification.
    expect(result).toMatchObject({ success: true, isActive: true });
    expect(mocks.markClaimVerificationsPaid).toHaveBeenCalledWith({
      appUserId: APP_USER_ID,
      paidAt: timestamp,
      acquisitionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    });
  });

  it('fails the webhook so Stripe retries when the verification transition cannot be written', async () => {
    const failure = new Error('db down');
    mocks.markClaimVerificationsPaid.mockRejectedValue(failure);
    const { CheckoutSessionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/checkout-handler'
    );
    const event = signedFixtureEvent();
    await expect(
      new CheckoutSessionHandler().handle({
        event,
        stripeEventId: event.id,
        stripeEventTimestamp: new Date(event.created * 1000),
      })
    ).rejects.toThrow('db down');
    expect(mocks.captureCriticalError).toHaveBeenCalledWith(
      'Claim verification payment transition failed',
      failure,
      expect.objectContaining({ event: 'checkout.session.completed' })
    );
  });

  it('does not record paid or admit the buyer when the subscription is not active', async () => {
    mocks.retrieveSubscription.mockResolvedValue({
      ...fixture.subscription,
      status: 'incomplete',
    });
    const { CheckoutSessionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/checkout-handler'
    );
    const event = signedFixtureEvent();
    await new CheckoutSessionHandler().handle({
      event,
      stripeEventId: event.id,
      stripeEventTimestamp: new Date(event.created * 1000),
    });

    expect(mocks.recordStage).not.toHaveBeenCalled();
    expect(mocks.admitPaidUser).not.toHaveBeenCalled();
    expect(mocks.markClaimVerificationsPaid).not.toHaveBeenCalled();
  });
});
