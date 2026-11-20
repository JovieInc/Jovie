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
import { captureError } from '@/lib/error-tracking';
import { extractCheckoutCorrelation } from '@/lib/stripe/checkout-correlation';
import { stripe } from '@/lib/stripe/client';
import { getPriceMappingDetails } from '@/lib/stripe/config';
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
          expand: ['line_items.data.price'],
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

    if (
      session.mode !== 'subscription' ||
      session.status !== 'complete' ||
      !isSettledCheckoutPaymentStatus(session.payment_status)
    ) {
      if (session.mode === 'subscription' && session.status === 'open') {
        return NextResponse.json(
          {
            plan: null,
            priceId: null,
            sessionStatus: 'open',
            checkoutUrl: normalizeStripeCheckoutUrl(session.url),
          },
          { headers: NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(
        { plan: null, priceId: null },
        { headers: NO_STORE_HEADERS }
      );
    }

    const lineItemPriceId = getLineItemPriceId(session.line_items?.data);
    const plan =
      resolvePaidPlan(session.metadata?.plan ?? null) ??
      (lineItemPriceId
        ? resolvePaidPlan(getPriceMappingDetails(lineItemPriceId)?.plan ?? null)
        : null);
    const needsProfile = plan ? profileState.needsProfile : false;
    const proofPending = plan
      ? await hasProofPendingProfile(userId, profileState.activeProfileId)
      : false;
    // Paying never publishes a page. The stage is "profile live", so a private
    // page waiting for proof must not record it.
    if (plan && !needsProfile && profileState.isPublic && !proofPending) {
      // Paid and the claimed profile is live: last artist-offer funnel stage.
      await recordArtistOfferStage(
        extractCheckoutCorrelation(session.metadata).acquisitionId,
        'profile-live'
      );
    }

    // Only a live, claimed page is shareable: a private page waiting for
    // proof must not be handed out as a link.
    const profileLive = Boolean(
      plan && !needsProfile && profileState.isPublic && !proofPending
    );
    const profileShareUrl =
      profileLive && profileState.username
        ? getProfileUrl(profileState.username)
        : null;

    return NextResponse.json(
      {
        plan,
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
