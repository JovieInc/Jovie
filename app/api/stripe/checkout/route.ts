/**
 * Stripe Checkout Session API
 * Creates checkout sessions for subscription purchases
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { createCheckoutSession } from '@/lib/stripe/client';
import { getActivePriceIds, getPriceMappingDetails } from '@/lib/stripe/config';
import { ensureStripeCustomer } from '@/lib/stripe/customer-sync';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Parse request body
    const body = await request.json();
    const { priceId } = body;

    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid price ID' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

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
    console.log('Creating checkout session for:', {
      userId,
      priceId,
      plan: priceDetails?.plan,
      description: priceDetails?.description,
    });

    // Ensure Stripe customer exists
    const customerResult = await ensureStripeCustomer();
    if (!customerResult.success || !customerResult.customerId) {
      console.error('Failed to ensure Stripe customer:', customerResult.error);
      return NextResponse.json(
        { error: 'Failed to create customer' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    // Create URLs for success and cancel
    const baseUrl = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/billing/success`;
    const cancelUrl = `${baseUrl}/billing/cancel`;

    // Create checkout session
    const session = await createCheckoutSession({
      customerId: customerResult.customerId,
      priceId,
      userId,
      successUrl,
      cancelUrl,
    });

    // Log successful checkout creation
    console.log('Checkout session created:', {
      sessionId: session.id,
      userId,
      priceId,
      customerId: customerResult.customerId,
      url: session.url,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    },
    { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating checkout session:', error);

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

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
