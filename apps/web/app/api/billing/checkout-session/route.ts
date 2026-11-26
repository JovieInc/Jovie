import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import { getProfileUrl } from '@/constants/domains';
import { recordArtistOfferStage } from '@/lib/acquisition/artist-offer-funnel.server';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type PlanId,
  resolveCanonicalPlanId,
} from '@/lib/entitlements/registry';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { extractCheckoutCorrelation } from '@/lib/stripe/checkout-correlation';
import { stripe } from '@/lib/stripe/client';
import { getPriceMappingDetails } from '@/lib/stripe/config';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import {
  isTransientStripeError,
  StripeRetryExhaustedError,
  withStripeRetry,
} from '@/lib/stripe/retry';
import { logger } from '@/lib/utils/logger';
import { hasProofPendingProfile } from '@/lib/waitlist/golden-path-admission.server';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

type PaidPlanId = Exclude<PlanId, 'free'>;

const checkoutSessionQuerySchema = z.object({
  session_id: z.string().startsWith('cs_'),
});

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: NO_STORE_HEADERS }
  );
}

function resolvePaidPlan(plan: string | null | undefined): PaidPlanId | null {
  const canonical = resolveCanonicalPlanId(plan);
  return canonical && canonical !== 'free' ? canonical : null;
}

function getLineItemPriceId(
  lineItems: Stripe.LineItem[] | undefined
): string | null {
  const price = lineItems?.[0]?.price;
  if (!price) return null;
  return typeof price === 'string' ? price : price.id;
}

/**
 * Anyone may buy the offer before they have a link (EVENT 2026-10-03,
 * JOV-7701), so a paid buyer without a claimed profile is sent on to claim
 * or create one instead of into the app.
 */
async function buyerProfileState(userId: string): Promise<{
  clerkId: string | null;
  activeProfileId: string | null;
  needsProfile: boolean;
  isPublic: boolean;
  username: string | null;
}> {
  const [row] = await db
    .select({
      clerkId: users.clerkId,
      activeProfileId: users.activeProfileId,
      isClaimed: creatorProfiles.isClaimed,
      isPublic: creatorProfiles.isPublic,
      username: creatorProfiles.username,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
    .where(eq(users.id, userId))
    .limit(1);
  return {
    clerkId: row?.clerkId ?? null,
    activeProfileId: row?.activeProfileId ?? null,
    needsProfile: row?.isClaimed !== true,
    isPublic: row?.isPublic === true,
    username: row?.username ?? null,
  };
}

function isSettledCheckoutPaymentStatus(
  paymentStatus: Stripe.Checkout.Session.PaymentStatus | null | undefined
): boolean {
  return paymentStatus === 'paid' || paymentStatus === 'no_payment_required';
}

function normalizeStripeCheckoutUrl(
  url: string | null | undefined
): string | null {
  return typeof url === 'string' &&
    url.startsWith('https://checkout.stripe.com/')
    ? url
    : null;
}

function stripeResourceId(
  value: string | { id: string } | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function expandedSubscription(
  session: Stripe.Checkout.Session
): Stripe.Subscription | null {
  const subscription = session.subscription;
  if (!subscription || typeof subscription === 'string') return null;
  return subscription;
}

function subscriptionItemPriceId(
  subscription: Stripe.Subscription
): string | null {
  const price = subscription.items?.data?.[0]?.price;
  if (!price) return null;
  return typeof price === 'string' ? price : price.id;
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await getCachedAuth({ session: 'fresh' });
    if (!userId) return jsonError('Unauthorized', 401);

    const rawSessionId = request.nextUrl.searchParams.get('session_id');
    if (rawSessionId === null) {
      const profileState = await buyerProfileState(userId);
      const proofPending = await hasProofPendingProfile(
        userId,
        profileState.activeProfileId
      );
      const profileLive =
        !profileState.needsProfile && profileState.isPublic && !proofPending;
      return NextResponse.json(
        {
          plan: null,
          priceId: null,
          needsProfile: profileState.needsProfile,
          proofPending,
          profileLive,
          profileShareUrl:
            profileLive && profileState.username
              ? getProfileUrl(profileState.username)
              : null,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const parsedQuery = checkoutSessionQuerySchema.safeParse({
      session_id: rawSessionId,
    });
    if (!parsedQuery.success) {
      return jsonError('Invalid checkout session ID', 400);
    }
    const { session_id: sessionId } = parsedQuery.data;

    const [session, profileState] = await Promise.all([
      withStripeRetry('retrieveCheckoutSession', () =>
        stripe.checkout.sessions.retrieve(sessionId, {
          expand: ['line_items.data.price', 'subscription'],
        })
      ),
      buyerProfileState(userId),
    ]);

    const sessionOwner =
      session.metadata?.clerk_user_id ?? session.metadata?.user_id ?? null;
    const isOwner =
      sessionOwner === userId ||
      (Boolean(profileState.clerkId) && sessionOwner === profileState.clerkId);
    if (!isOwner) {
      return jsonError('Checkout session not found', 404);
    }

    const lineItemPriceId = getLineItemPriceId(session.line_items?.data);

    if (session.mode === 'subscription' && session.status === 'open') {
      return NextResponse.json(
        {
          status: 'unconfirmed',
          plan: null,
          priceId: null,
          sessionStatus: 'open',
          checkoutUrl: normalizeStripeCheckoutUrl(session.url),
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (session.mode !== 'subscription' || session.status !== 'complete') {
      return NextResponse.json(
        { status: 'unconfirmed', plan: null, priceId: null },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Completion means the checkout UI finished, not that payment settled.
    // A still-unpaid session can reconcile; it must not certify a plan.
    if (!isSettledCheckoutPaymentStatus(session.payment_status)) {
      return NextResponse.json(
        { status: 'pending', plan: null, priceId: lineItemPriceId },
        { headers: NO_STORE_HEADERS }
      );
    }

    const subscription = expandedSubscription(session);
    if (
      !subscription ||
      (subscription.status !== 'active' && subscription.status !== 'trialing')
    ) {
      return NextResponse.json(
        { status: 'unconfirmed', plan: null, priceId: lineItemPriceId },
        { headers: NO_STORE_HEADERS }
      );
    }

    const plan =
      (lineItemPriceId
        ? resolvePaidPlan(getPriceMappingDetails(lineItemPriceId)?.plan ?? null)
        : null) ?? resolvePaidPlan(session.metadata?.plan ?? null);
    const [entitlement, billing] = await Promise.all([
      getCurrentUserEntitlements({ session: 'fresh' }),
      getUserBillingInfo(),
    ]);
    const entitlementPlan = resolvePaidPlan(entitlement.plan);
    const confirmedPlan =
      entitlementPlan === 'trial' && subscription.status === 'trialing'
        ? entitlementPlan
        : plan;
    const customerId = stripeResourceId(session.customer);
    const subscriptionCustomerId = stripeResourceId(subscription.customer);
    const billingData = billing.success ? billing.data : undefined;
    const currentSubscriptionMatches =
      Boolean(plan) &&
      Boolean(lineItemPriceId) &&
      subscriptionItemPriceId(subscription) === lineItemPriceId &&
      entitlement.userId === userId &&
      entitlement.billingVerification === 'verified' &&
      entitlement.isPro === true &&
      entitlementPlan === confirmedPlan &&
      billingData?.stripeSubscriptionId === subscription.id &&
      billingData?.stripePriceId === lineItemPriceId &&
      Boolean(customerId) &&
      customerId === subscriptionCustomerId &&
      billingData?.stripeCustomerId === customerId;

    if (!currentSubscriptionMatches) {
      return NextResponse.json(
        { status: 'pending', plan: null, priceId: lineItemPriceId },
        { headers: NO_STORE_HEADERS }
      );
    }

    const needsProfile = profileState.needsProfile;
    const proofPending = await hasProofPendingProfile(
      userId,
      profileState.activeProfileId
    );
    // Paying never publishes a page. The stage is "profile live", so a private
    // page waiting for proof must not record it.
    if (!needsProfile && profileState.isPublic && !proofPending) {
      await recordArtistOfferStage(
        extractCheckoutCorrelation(session.metadata).acquisitionId,
        'profile-live'
      );
    }

    const profileLive = Boolean(
      !needsProfile && profileState.isPublic && !proofPending
    );
    const profileShareUrl =
      profileLive && profileState.username
        ? getProfileUrl(profileState.username)
        : null;

    return NextResponse.json(
      {
        status: 'confirmed',
        paymentStatus: session.payment_status,
        plan: confirmedPlan,
        priceId: lineItemPriceId,
        needsProfile,
        proofPending,
        profileLive,
        profileShareUrl,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error validating checkout session:', error);
    await captureError('Checkout session validation failed', error, {
      route: '/api/billing/checkout-session',
    });

    if (
      error instanceof StripeRetryExhaustedError ||
      isTransientStripeError(error)
    ) {
      return NextResponse.json(
        { error: 'Billing service temporarily unavailable' },
        {
          status: 503,
          headers: { ...NO_STORE_HEADERS, 'Retry-After': '5' },
        }
      );
    }

    return jsonError('Failed to validate checkout session', 500);
  }
}
