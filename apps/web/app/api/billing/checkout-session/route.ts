import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  type PlanId,
  resolveCanonicalPlanId,
} from '@/lib/entitlements/registry';
import { captureError } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { getPriceMappingDetails } from '@/lib/stripe/config';
import {
  isTransientStripeError,
  StripeRetryExhaustedError,
  withStripeRetry,
} from '@/lib/stripe/retry';
import { logger } from '@/lib/utils/logger';

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
      return NextResponse.json({ plan: null }, { headers: NO_STORE_HEADERS });
    }

    const metadataPlan = resolvePaidPlan(session.metadata?.plan ?? null);
    if (metadataPlan) {
      return NextResponse.json(
        { plan: metadataPlan },
        { headers: NO_STORE_HEADERS }
      );
    }

    const lineItemPriceId = getLineItemPriceId(session.line_items?.data);
    const mappedPlan = lineItemPriceId
      ? resolvePaidPlan(getPriceMappingDetails(lineItemPriceId)?.plan ?? null)
      : null;

    return NextResponse.json(
      { plan: mappedPlan },
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
