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
 * - Event processing is delegated to domain-specific handlers via getHandler()
 * - Handlers are registered in lib/stripe/webhooks/registry.ts
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { withTransaction } from '@/lib/db';
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

const webhookSecret = env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
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

    // Use a transaction for atomic webhook processing:
    // 1. Insert or get existing webhook record
    // 2. Check if already processed (idempotency)
    // 3. Process the event
    // 4. Mark as processed
    // If any step fails, the transaction rolls back for clean retry
    const { error: txError } = await withTransaction(async tx => {
      // Check if event already exists
      const [existingEvent] = await tx
        .select({
          id: stripeWebhookEvents.id,
          processedAt: stripeWebhookEvents.processedAt,
        })
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, event.id))
        .limit(1);

      if (existingEvent?.processedAt) {
        // Already processed - skip (idempotent)
        return { skipped: true, reason: 'already_processed' };
      }

      let webhookRecordId: string;

      if (existingEvent) {
        // Event exists but wasn't processed (previous failure) - retry processing
        webhookRecordId = existingEvent.id;
      } else {
        // New event - insert record
        const [newRecord] = await tx
          .insert(stripeWebhookEvents)
          .values({
            stripeEventId: event.id,
            type: event.type,
            stripeObjectId: getStripeObjectId(event),
            stripeCreatedAt,
            payload: event as unknown as Record<string, unknown>,
          })
          .returning({ id: stripeWebhookEvents.id });

        if (!newRecord) {
          throw new Error('Failed to insert webhook event record');
        }
        webhookRecordId = newRecord.id;
      }

      // Process the event (handlers throw on failure)
      await processWebhookEvent(event, stripeCreatedAt);

      // Mark event as processed atomically within the transaction
      await tx
        .update(stripeWebhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(stripeWebhookEvents.id, webhookRecordId));

      return { skipped: false, processed: true };
    });

    if (txError) {
      await captureCriticalError('Stripe webhook transaction failed', txError, {
        route: '/api/stripe/webhooks',
        eventId: event.id,
        eventType: event.type,
      });
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
 * @throws If the handler throws (triggers transaction rollback)
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
  // Handlers throw on unrecoverable errors to trigger transaction rollback
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
