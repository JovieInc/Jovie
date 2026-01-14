/**
 * Stripe Billing Portal API
 * Creates billing portal sessions for Pro users to manage their subscriptions
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { publicEnv } from '@/lib/env-public';
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
      return NextResponse.json(
        { error: 'Failed to retrieve billing information' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const { stripeCustomerId } = billingResult.data;

    // Check if user has a Stripe customer ID
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account found' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Optionally check if user is Pro (uncomment if you want to restrict access)
    // if (!isPro) {
    //   return NextResponse.json(
    //     { error: 'Pro subscription required' },
    //     { status: 403 }
    //   );
    // }

    // Create return URL
    const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const returnUrl = `${baseUrl}/app/dashboard`;

    // Create billing portal session
    const session = await createBillingPortalSession({
      customerId: stripeCustomerId,
      returnUrl,
    });

    // Log portal session creation
    console.log('Billing portal session created:', {
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
