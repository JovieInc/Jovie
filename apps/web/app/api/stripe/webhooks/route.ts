/**
 * Stripe Webhooks Handler
 * Handles subscription events and updates user billing status
 * Webhooks are the source of truth for billing status
 *
 * Hardened with:
 * - Event ordering via stripeCreatedAt to skip stale events
 * - Optimistic locking to prevent concurrent overwrites
 * - Audit logging for all state changes
 * - Expanded payment failure handling
 *
 * Security Notes:
 * - Stripe customer IDs and subscription IDs are considered PII and are NOT logged
 * - Only internal user IDs, event IDs, event types, and price IDs are safe to log
 * - All errors are sent to error tracking with sanitized context
 *
 * Architecture:
 * - This route handles signature verification and idempotency
 * - Idempotency relies on the unique constraint on stripe_event_id (not transactions)
 * - Neon HTTP driver does not support transactions; operations are sequential
 * - Event processing is delegated to domain-specific handlers via getHandler()
 * - Handlers are registered in lib/stripe/webhooks/registry.ts
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { db } from '@/lib/db';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import {
  getHandler,
  getStripeObjectId,
  stripeTimestampToDate,
  type WebhookContext,
} from '@/lib/stripe/webhooks';
import { logger } from '@/lib/utils/logger';

// Force Node.js runtime for Stripe SDK compatibility
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    await captureCriticalError(
      'STRIPE_WEBHOOK_SECRET is not configured',
      new Error('Missing STRIPE_WEBHOOK_SECRET environment variable'),
      { route: '/api/stripe/webhooks' }
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
      await captureCriticalError(
        'Missing Stripe webhook signature',
        new Error('Missing signature header'),
        { route: '/api/stripe/webhooks' }
      );
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      await captureCriticalError('Invalid Stripe webhook signature', error, {
        route: '/api/stripe/webhooks',
      });
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const stripeCreatedAt = stripeTimestampToDate(event.created);

    // Sequential webhook processing with idempotency via unique constraint:
    // 1. Insert-or-skip webhook record (unique on stripe_event_id)
    // 2. Check if already processed
    // 3. Process the event
    // 4. Mark as processed
    // NOTE: Neon HTTP driver does not support transactions. If step 3 fails,
    // the unprocessed record remains and Stripe's retry will re-attempt.
    try {
      // Attempt insert; unique constraint on stripeEventId handles duplicates
      const [insertedRecord] = await db
        .insert(stripeWebhookEvents)
        .values({
          stripeEventId: event.id,
          type: event.type,
          stripeObjectId: getStripeObjectId(event),
          stripeCreatedAt,
          payload: event as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing()
        .returning({ id: stripeWebhookEvents.id });

      let webhookRecordId: string;

      if (insertedRecord) {
        // New event — use the newly inserted record
        webhookRecordId = insertedRecord.id;
      } else {
        // Conflict: event already exists — check if already processed
        const [existingEvent] = await db
          .select({
            id: stripeWebhookEvents.id,
            processedAt: stripeWebhookEvents.processedAt,
          })
          .from(stripeWebhookEvents)
          .where(eq(stripeWebhookEvents.stripeEventId, event.id))
          .limit(1);

        if (!existingEvent) {
          throw new Error(
            'Webhook record disappeared after conflict — possible data race'
          );
        }

        if (existingEvent.processedAt) {
          // Already processed — skip (idempotent)
          return NextResponse.json(
            { received: true },
            { headers: NO_STORE_HEADERS }
          );
        }

        // Exists but unprocessed (previous failure) — retry processing
        webhookRecordId = existingEvent.id;
      }

      // Process the event (handlers throw on failure)
      await processWebhookEvent(event, stripeCreatedAt);

      // Mark event as processed
      await db
        .update(stripeWebhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(stripeWebhookEvents.id, webhookRecordId));
    } catch (processingError) {
      await captureCriticalError(
        'Stripe webhook processing failed',
        processingError,
        {
          route: '/api/stripe/webhooks',
          eventId: event.id,
          eventType: event.type,
        }
      );
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureCriticalError('Stripe webhook processing failed', error, {
      route: '/api/stripe/webhooks',
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Process a webhook event by delegating to the appropriate handler.
 *
 * Uses the handler registry to find the correct domain-specific handler
 * for the event type. Unhandled events are acknowledged but not processed.
 *
 * @param event - The Stripe webhook event
 * @param stripeCreatedAt - When Stripe created the event (for event ordering)
 * @throws If the handler throws (leaves event unprocessed for Stripe retry)
 */
async function processWebhookEvent(
  event: Stripe.Event,
  stripeCreatedAt: Date
): Promise<void> {
  // Get the handler for this event type
  const handler = getHandler(event.type);

  if (!handler) {
    // Unhandled event types are expected - Stripe sends many event types
    // Log unexpected events to help detect configuration issues or new event types
    logger.warn(
      `[Stripe Webhook] Received unexpected event type: ${event.type}`,
      { eventId: event.id, eventType: event.type }
    );
    // We acknowledge them but don't process (return 200 to Stripe)
    return;
  }

  // Create the context for the handler
  const context: WebhookContext = {
    event,
    stripeEventId: event.id,
    stripeEventTimestamp: stripeCreatedAt,
  };

  // Delegate to the domain-specific handler
  // Handlers throw on unrecoverable errors, leaving the event unprocessed for retry
  const result = await handler.handle(context);

  // If the handler returned an error (not thrown), log it
  if (!result.success && !result.skipped && result.error) {
    await captureCriticalError(
      `Handler failed for ${event.type}`,
      new Error(result.error),
      {
        route: '/api/stripe/webhooks',
        eventId: event.id,
        eventType: event.type,
      }
    );
    throw new Error(result.error);
  }
}

// Only allow POST requests (webhooks)
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
