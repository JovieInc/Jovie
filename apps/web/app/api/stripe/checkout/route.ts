/**
 * Stripe Checkout Session API
 * Creates checkout sessions for subscription purchases
 */

import type { NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env-public';
import {
  createBillingPortalSession,
  createCheckoutSession,
  stripe,
} from '@/lib/stripe/client';
import {
  getActivePriceIds,
  getPriceMappingDetails,
  PRICE_MAPPINGS,
} from '@/lib/stripe/config';
import { ensureStripeCustomer } from '@/lib/stripe/customer-sync';
import { withAuthAndErrorHandler } from '@/lib/api/middleware';
import {
  successResponse,
  validationErrorResponse,
  internalErrorResponse,
  errorResponse,
} from '@/lib/api/responses';

export const runtime = 'nodejs';

export const POST = withAuthAndErrorHandler(
  async (request: NextRequest, { userId }) => {
    const body = await request.json();
    const { priceId } = body;

    if (!priceId || typeof priceId !== 'string') {
      return validationErrorResponse('Invalid price ID');
    }

    const activePriceIds = getActivePriceIds();
    if (!activePriceIds.includes(priceId)) {
      return validationErrorResponse('Invalid price ID');
    }

    const priceDetails = getPriceMappingDetails(priceId);
    console.log('Creating checkout session for:', {
      userId,
      priceId,
      plan: priceDetails?.plan,
      description: priceDetails?.description,
    });

    const customerResult = await ensureStripeCustomer();
    if (!customerResult.success || !customerResult.customerId) {
      console.error('Failed to ensure Stripe customer:', customerResult.error);
      return internalErrorResponse('Failed to create customer');
    }

    if (priceDetails?.plan) {
      const planPriceIds = Object.values(PRICE_MAPPINGS)
        .filter(mapping => mapping.plan === priceDetails.plan)
        .map(mapping => mapping.priceId);

      const activeSubscriptionStatuses = new Set([
        'active',
        'trialing',
        'past_due',
        'unpaid',
      ]);

      const existingSubscriptions = await stripe.subscriptions.list({
        customer: customerResult.customerId,
        status: 'all',
        limit: 25,
      });

      const alreadySubscribedToPlan = existingSubscriptions.data.some(
        subscription =>
          activeSubscriptionStatuses.has(subscription.status) &&
          subscription.items.data.some(item => {
            const itemPriceId = item.price?.id;
            return (
              typeof itemPriceId === 'string' &&
              planPriceIds.includes(itemPriceId)
            );
          })
      );

      if (alreadySubscribedToPlan) {
        const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const returnUrl = `${baseUrl}/app/dashboard`;
        const portalSession = await createBillingPortalSession({
          customerId: customerResult.customerId,
          returnUrl,
        });

        return successResponse({
          sessionId: portalSession.id,
          url: portalSession.url,
          alreadySubscribed: true,
        });
      }
    }

    const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/billing/success`;
    const cancelUrl = `${baseUrl}/billing/cancel`;

    const idempotencyBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const idempotencyKey = `checkout:${userId}:${priceId}:${idempotencyBucket}`;

    const session = await createCheckoutSession({
      customerId: customerResult.customerId,
      priceId,
      userId,
      successUrl,
      cancelUrl,
      idempotencyKey,
    });

    console.log('Checkout session created:', {
      sessionId: session.id,
      userId,
      priceId,
      customerId: customerResult.customerId,
      url: session.url,
    });

    return successResponse({
      sessionId: session.id,
      url: session.url,
    });
  },
  { route: '/api/stripe/checkout' }
);

export const GET = withAuthAndErrorHandler(
  async () => {
    return errorResponse('Method not allowed', { status: 405 });
  },
  { route: '/api/stripe/checkout' }
);
