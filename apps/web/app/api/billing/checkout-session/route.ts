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
  needsProfile: boolean;
  isPublic: boolean;
  username: string | null;
}> {
  const [row] = await db
    .select({
      isClaimed: creatorProfiles.isClaimed,
      isPublic: creatorProfiles.isPublic,
      username: creatorProfiles.username,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
    .where(eq(users.id, userId))
    .limit(1);
  return {
    needsProfile: row?.isClaimed !== true,
    isPublic: row?.isPublic === true,
    username: row?.username ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) return jsonError('Unauthorized', 401);

    const parsedQuery = checkoutSessionQuerySchema.safeParse({
      session_id: request.nextUrl.searchParams.get('session_id'),
    });
    if (!parsedQuery.success) {
      return jsonError('Invalid checkout session ID', 400);
    }
    const { session_id: sessionId } = parsedQuery.data;

    const session = await withStripeRetry('retrieveCheckoutSession', () =>
      stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items.data.price'],
      })
    );

    if (session.metadata?.clerk_user_id !== userId) {
      return jsonError('Checkout session not found', 404);
    }

    if (session.mode !== 'subscription' || session.status !== 'complete') {
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
    const profileState = plan
      ? await buyerProfileState(userId)
      : { needsProfile: false, isPublic: false, username: null };
    const needsProfile = profileState.needsProfile;
    const proofPending = plan ? await hasProofPendingProfile(userId) : false;
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
    const profileShareUrl =
      plan &&
      !needsProfile &&
      profileState.isPublic &&
      !proofPending &&
      profileState.username
        ? getProfileUrl(profileState.username)
        : null;

    return NextResponse.json(
      {
        plan,
        priceId: lineItemPriceId,
        needsProfile,
        proofPending,
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
