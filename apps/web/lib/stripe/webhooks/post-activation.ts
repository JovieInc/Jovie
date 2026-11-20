import type Stripe from 'stripe';

import { recordArtistOfferStage } from '@/lib/acquisition/artist-offer-funnel.server';
import { markClaimVerificationsPaid } from '@/lib/claim/claim-verification.server';
import { enqueuePaidWelcomeAfterEntitlement } from '@/lib/email/paid-welcome';
import { captureCriticalError } from '@/lib/error-tracking';
import { attributeLeadPaidConversionByAppUserId } from '@/lib/leads/funnel-events';
import { activateReferral } from '@/lib/referrals/service';
import type { CheckoutCorrelation } from '@/lib/stripe/checkout-correlation';
import { logger } from '@/lib/utils/logger';
import { admitPaidUser } from '@/lib/waitlist/paid-admission';

async function tryActivateReferral(appUserId: string): Promise<void> {
  try {
    await activateReferral(appUserId);
  } catch (error) {
    logger.warn('Failed to activate referral on subscription activation', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function runActiveSubscriptionPostEffects(params: {
  readonly appUserId: string;
  readonly userId: string;
  readonly subscription: Stripe.Subscription;
  readonly plan?: string;
  readonly correlation?: CheckoutCorrelation;
  readonly acquisitionId?: string | null;
  readonly stripeEventTimestamp: Date;
  readonly eventName:
    | 'checkout.session.completed'
    | 'customer.subscription.created'
    | 'customer.subscription.updated';
}): Promise<void> {
  const {
    appUserId,
    userId,
    subscription,
    plan,
    correlation,
    stripeEventTimestamp,
    eventName,
  } = params;
  const acquisitionId =
    params.acquisitionId ?? correlation?.acquisitionId ?? null;

  await admitPaidUser({
    appUserId,
    cacheKeys: [userId],
  });

  await tryActivateReferral(appUserId);

  enqueuePaidWelcomeAfterEntitlement({
    appUserId,
    clerkUserId: userId,
    subscription,
    plan,
  });

  try {
    await attributeLeadPaidConversionByAppUserId(
      appUserId,
      subscription.id,
      correlation
    );
  } catch (error) {
    await captureCriticalError(
      'Lead paid conversion outcome receipt failed',
      error,
      {
        route: '/api/stripe/webhooks',
        event: eventName,
        subscriptionId: subscription.id,
        userId,
      }
    );
    throw error;
  }

  await recordArtistOfferStage(acquisitionId, 'paid', stripeEventTimestamp);

  try {
    await markClaimVerificationsPaid({
      appUserId,
      paidAt: stripeEventTimestamp,
      acquisitionId,
    });
  } catch (error) {
    await captureCriticalError(
      'Claim verification payment transition failed',
      error,
      {
        route: '/api/stripe/webhooks',
        event: eventName,
        subscriptionId: subscription.id,
        userId,
      }
    );
    throw error;
  }
}
