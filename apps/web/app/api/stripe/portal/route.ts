/**
 * Stripe Billing Portal API
 * Creates billing portal sessions for Pro users to manage their subscriptions
 */

import { publicEnv } from '@/lib/env-public';
import { createBillingPortalSession } from '@/lib/stripe/client';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import { withAuthAndErrorHandler } from '@/lib/api/middleware';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api/responses';

export const runtime = 'nodejs';

export const POST = withAuthAndErrorHandler(
  async (_request, { userId }) => {
    const billingResult = await getUserBillingInfo();
    if (!billingResult.success || !billingResult.data) {
      console.error('Failed to get user billing info:', billingResult.error);
      return internalErrorResponse('Failed to retrieve billing information');
    }

    const { stripeCustomerId } = billingResult.data;

    if (!stripeCustomerId) {
      return errorResponse('No billing account found', { status: 400 });
    }

    const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const returnUrl = `${baseUrl}/app/dashboard`;

    try {
      const session = await createBillingPortalSession({
        customerId: stripeCustomerId,
        returnUrl,
      });

      console.log('Billing portal session created:', {
        userId,
        customerId: stripeCustomerId,
        sessionId: session.id,
        url: session.url,
      });

      return successResponse({
        sessionId: session.id,
        url: session.url,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('customer')) {
        return notFoundResponse('Customer not found');
      }
      throw error;
    }
  },
  { route: '/api/stripe/portal' }
);

export const GET = withAuthAndErrorHandler(
  async () => {
    return errorResponse('Method not allowed', { status: 405 });
  },
  { route: '/api/stripe/portal' }
);
