/**
 * Stripe Checkout Session API
 * Creates checkout sessions for subscription purchases
 */

import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
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
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  return Sentry.startSpan(
    { op: 'http.server', name: 'POST /api/stripe/checkout' },
    async span => {
      try {
        // Check authentication
        const { userId } = await auth();
        if (!userId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401, headers: NO_STORE_HEADERS }
          );
        }

        span.setAttribute('user_id', userId);

        // Parse request body
        const body = await request.json();
        const { priceId } = body;

        if (!priceId || typeof priceId !== 'string') {
          return NextResponse.json(
            { error: 'Invalid price ID' },
            { status: 400, headers: NO_STORE_HEADERS }
          );
        }

        span.setAttribute('price_id', priceId);

        // Validate that the price ID is one of our active prices
        const activePriceIds = getActivePriceIds();
        if (!activePriceIds.includes(priceId)) {
          return NextResponse.json(
            { error: 'Invalid price ID' },
            { status: 400, headers: NO_STORE_HEADERS }
          );
        }

        // Get price details for logging
        const priceDetails = getPriceMappingDetails(priceId);
        logger.info(
          logger.fmt`Creating checkout session`,
          {
            userId,
            priceId,
            plan: priceDetails?.plan,
            description: priceDetails?.description,
          },
          'billing'
        );

        // Ensure Stripe customer exists
        const customerResult = await Sentry.startSpan(
          { op: 'stripe.customer.ensure', name: 'ensureStripeCustomer' },
          () => ensureStripeCustomer()
        );
        const customerId = customerResult.customerId;
        if (!customerResult.success || !customerId) {
          logger.error(
            logger.fmt`Failed to ensure Stripe customer`,
            { error: customerResult.error, userId },
            'billing'
          );
          return NextResponse.json(
            { error: 'Failed to create customer' },
            { status: 500, headers: NO_STORE_HEADERS }
          );
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

          const existingSubscriptions = await Sentry.startSpan(
            {
              op: 'stripe.subscriptions.list',
              name: 'stripe.subscriptions.list',
            },
            () =>
              stripe.subscriptions.list({
                customer: customerId,
                status: 'all',
                limit: 25,
              })
          );

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
            const baseUrl = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const returnUrl = `${baseUrl}/app/dashboard`;
            const portalSession = await Sentry.startSpan(
              { op: 'stripe.portal', name: 'createBillingPortalSession' },
              () =>
                createBillingPortalSession({
                  customerId,
                  returnUrl,
                })
            );

            return NextResponse.json(
              {
                sessionId: portalSession.id,
                url: portalSession.url,
                alreadySubscribed: true,
              },
              { headers: NO_STORE_HEADERS }
            );
          }
        }

        // Create URLs for success and cancel
        const baseUrl = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const successUrl = `${baseUrl}/billing/success`;
        const cancelUrl = `${baseUrl}/billing/cancel`;

        const idempotencyBucket = Math.floor(Date.now() / (5 * 60 * 1000));
        const idempotencyKey = `checkout:${userId}:${priceId}:${idempotencyBucket}`;

        // Create checkout session
        const session = await Sentry.startSpan(
          { op: 'stripe.checkout', name: 'createCheckoutSession' },
          () =>
            createCheckoutSession({
              customerId,
              priceId,
              userId,
              successUrl,
              cancelUrl,
              idempotencyKey,
            })
        );

        // Log successful checkout creation
        logger.info(
          logger.fmt`Checkout session created`,
          {
            sessionId: session.id,
            userId,
            priceId,
            customerId,
            url: session.url,
          },
          'billing'
        );

        return NextResponse.json(
          {
            sessionId: session.id,
            url: session.url,
          },
          { headers: NO_STORE_HEADERS }
        );
      } catch (error) {
        Sentry.captureException(error);
        logger.error(
          logger.fmt`Checkout session failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
          undefined,
          'billing'
        );

        // Return appropriate error based on the error type
        if (error instanceof Error) {
          if (error.message.includes('customer')) {
            return NextResponse.json(
              { error: 'Customer setup failed' },
              { status: 500, headers: NO_STORE_HEADERS }
            );
          }
          if (error.message.includes('price')) {
            return NextResponse.json(
              { error: 'Invalid pricing configuration' },
              { status: 400, headers: NO_STORE_HEADERS }
            );
          }
        }

        return NextResponse.json(
          { error: 'Failed to create checkout session' },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }
    }
  );
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
