/**
 * Stripe Billing Portal API
 * Creates billing portal sessions for Pro users to manage their subscriptions
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { publicEnv } from '@/lib/env-public';
import { captureCriticalError } from '@/lib/error-tracking';
import { createBillingPortalSession } from '@/lib/stripe/client';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST() {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Get user's billing information
    const billingResult = await getUserBillingInfo();
    if (!billingResult.success || !billingResult.data) {
      logger.error('Failed to get user billing info:', billingResult.error);
      await captureCriticalError(
        'Portal: billing info lookup failed',
        new Error(billingResult.error || 'No billing data returned'),
        { route: '/api/stripe/portal', userId }
      );
      return NextResponse.json(
        { error: 'Failed to retrieve billing information' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const { stripeCustomerId } = billingResult.data;

    // Free users without a Stripe customer can't access the billing portal.
    // Users who had a subscription but cancelled still have a customer ID
    // and should be able to manage billing (view invoices, resubscribe).
    if (!stripeCustomerId) {
      return NextResponse.json(
        {
          error: 'No billing account found. Upgrade to Pro to manage billing.',
          code: 'no_billing_account',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Create return URL
    const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const returnUrl = `${baseUrl}${APP_ROUTES.DASHBOARD}`;

    // Create billing portal session
    const session = await createBillingPortalSession({
      customerId: stripeCustomerId,
      returnUrl,
    });

    // Log portal session creation
    logger.info('Billing portal session created:', {
      userId,
      customerId: stripeCustomerId,
      sessionId: session.id,
      url: session.url,
    });

    return NextResponse.json(
      {
        sessionId: session.id,
        url: session.url,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error creating billing portal session:', error);
    await captureCriticalError(
      'Stripe billing portal session creation failed',
      error,
      {
        route: '/api/stripe/portal',
        method: 'POST',
      }
    );

    // Return appropriate error based on the error type
    if (error instanceof Error) {
      if (error.message.includes('customer')) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
