/**
 * Stripe Connect Webhook Handler
 *
 * Handles `account.updated` events from Stripe Connect to keep
 * creator profile fields in sync with the connected account status.
 *
 * Verifies the webhook signature using STRIPE_CONNECT_WEBHOOK_SECRET.
 */

import { and, eq, isNull, lt, or } from 'drizzle-orm';
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
      const eventCreatedAt = new Date(event.created * 1000);

      const chargesEnabled = account.charges_enabled === true;
      const payoutsEnabled = account.payouts_enabled === true;
      const detailsSubmitted = account.details_submitted === true;
      const payoutEmail =
        typeof account.email === 'string' ? account.email : null;
      const now = new Date();

      // Idempotency guard: only apply when this event is newer than the last
      // event we processed for this account. Stripe replays events with the
      // same `event.created`, and out-of-order delivery would otherwise
      // overwrite fresh flags with stale data.
      const [updated] = await db
        .update(creatorProfiles)
        .set({
          stripeChargesEnabled: chargesEnabled,
          stripePayoutsEnabled: payoutsEnabled,
          stripeDetailsSubmitted: detailsSubmitted,
          stripeOnboardingComplete: detailsSubmitted,
          stripePayoutEmail: payoutEmail,
          stripeConnectLastSyncedAt: now,
          stripeConnectLastEventAt: eventCreatedAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(creatorProfiles.stripeAccountId, stripeAccountId),
            or(
              isNull(creatorProfiles.stripeConnectLastEventAt),
              lt(creatorProfiles.stripeConnectLastEventAt, eventCreatedAt)
            )
          )
        )
        .returning({ id: creatorProfiles.id });

      if (!updated) {
        // Either no profile is linked to this account, OR the event is older
        // than the last one we processed (replay). Both cases are no-ops.
        logger.warn(
          `[Stripe Connect Webhook] No update for account ${stripeAccountId} (no profile or stale event)`,
          {
            eventId: event.id,
            eventCreatedAt: eventCreatedAt.toISOString(),
          }
        );
      }
    } else if (event.type === 'account.application.deauthorized') {
      // For deauthorized events, `event.account` is the connected account id
      // (the event object itself is the Stripe Application, not the Account).
      const stripeAccountId = event.account;
      if (stripeAccountId) {
        const now = new Date();
        const eventCreatedAt = new Date(event.created * 1000);
        // Idempotency guard mirrors the account.updated branch: a delayed
        // post-deauth account.updated would otherwise repopulate the cached
        // flags via a newer eventCreatedAt vs. the row's pre-deauth
        // lastEventAt. Bumping lastEventAt here invalidates that path.
        // Also clears stripeAccountId so /api/stripe-connect/status reports
        // disconnected immediately.
        await db
          .update(creatorProfiles)
          .set({
            stripeAccountId: null,
            stripeChargesEnabled: false,
            stripePayoutsEnabled: false,
            stripeDetailsSubmitted: false,
            stripeOnboardingComplete: false,
            stripePayoutEmail: null,
            stripeConnectLastSyncedAt: now,
            stripeConnectLastEventAt: eventCreatedAt,
            updatedAt: now,
          })
          .where(
            and(
              eq(creatorProfiles.stripeAccountId, stripeAccountId),
              or(
                isNull(creatorProfiles.stripeConnectLastEventAt),
                lt(creatorProfiles.stripeConnectLastEventAt, eventCreatedAt)
              )
            )
          );
      } else {
        logger.warn(
          '[Stripe Connect Webhook] account.application.deauthorized missing event.account',
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
