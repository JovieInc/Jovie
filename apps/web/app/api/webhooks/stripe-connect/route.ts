/**
 * Stripe Connect Webhook Handler
 *
 * Handles `account.updated` events from Stripe Connect to keep
 * creator profile fields in sync with the connected account status.
 *
 * Verifies the webhook signature using STRIPE_CONNECT_WEBHOOK_SECRET.
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  const webhookSecret = env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    await captureCriticalError(
      'STRIPE_CONNECT_WEBHOOK_SECRET is not configured',
      new Error('Missing STRIPE_CONNECT_WEBHOOK_SECRET environment variable'),
      { route: '/api/webhooks/stripe-connect' }
    );
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch {
      await captureCriticalError(
        'Invalid Stripe Connect webhook signature',
        new Error('Signature verification failed'),
        { route: '/api/webhooks/stripe-connect' }
      );
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Handle account.updated events
    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      const stripeAccountId = account.id;

      const onboardingComplete = account.details_submitted === true;
      const payoutsEnabled = account.payouts_enabled === true;

      // Update the creator profile that has this Stripe account ID
      const [updated] = await db
        .update(creatorProfiles)
        .set({
          stripeOnboardingComplete: onboardingComplete,
          stripePayoutsEnabled: payoutsEnabled,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.stripeAccountId, stripeAccountId))
        .returning({ id: creatorProfiles.id });

      if (!updated) {
        // Account not linked to any profile — may have been disconnected
        logger.warn(
          `[Stripe Connect Webhook] No profile found for account ${stripeAccountId}`,
          { eventId: event.id }
        );
      }
    } else {
      // Log unhandled event types for visibility
      logger.warn(
        `[Stripe Connect Webhook] Unhandled event type: ${event.type}`,
        { eventId: event.id }
      );
    }

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    await captureCriticalError(
      'Stripe Connect webhook processing failed',
      err,
      { route: '/api/webhooks/stripe-connect' }
    );
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
