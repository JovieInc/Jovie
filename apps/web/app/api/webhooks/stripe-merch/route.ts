import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  handleMerchChargeRefunded,
  handleMerchCheckoutCompleted,
} from '@/lib/merch/orders';
import { stripe } from '@/lib/stripe/client';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

function getStripeObjectId(event: Stripe.Event): string | null {
  const object = event.data.object as { readonly id?: string };
  return object.id ?? null;
}

const STALE_PROCESSING_CLAIM_MS = 10 * 60 * 1000;

async function claimStripeWebhookEvent(params: {
  readonly eventId: string;
  readonly webhookRecordId: string;
}): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_CLAIM_MS);
  const [claimed] = await db
    .update(stripeWebhookEvents)
    .set({ processingStartedAt: now })
    .where(
      and(
        eq(stripeWebhookEvents.id, params.webhookRecordId),
        eq(stripeWebhookEvents.stripeEventId, params.eventId),
        isNull(stripeWebhookEvents.processedAt),
        drizzleSql`(${stripeWebhookEvents.processingStartedAt} IS NULL OR ${stripeWebhookEvents.processingStartedAt} < ${staleBefore})`
      )
    )
    .returning({ id: stripeWebhookEvents.id });

  return Boolean(claimed);
}

async function clearStripeWebhookClaim(webhookRecordId: string): Promise<void> {
  await db
    .update(stripeWebhookEvents)
    .set({ processingStartedAt: null })
    .where(
      and(
        eq(stripeWebhookEvents.id, webhookRecordId),
        isNull(stripeWebhookEvents.processedAt)
      )
    );
}

export async function POST(request: NextRequest) {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET_MERCH;
  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET_MERCH not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'No signature' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    logger.error('Invalid Stripe signature for merch webhook', error);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const [insertedRecord] = await db
      .insert(stripeWebhookEvents)
      .values({
        stripeEventId: event.id,
        type: event.type,
        stripeObjectId: getStripeObjectId(event),
        stripeCreatedAt: new Date(event.created * 1000),
        payload: event as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ id: stripeWebhookEvents.id });

    let webhookRecordId: string;
    if (insertedRecord) {
      webhookRecordId = insertedRecord.id;
    } else {
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
          'Stripe merch webhook record disappeared after conflict'
        );
      }
      if (existingEvent.processedAt) {
        return NextResponse.json(
          { received: true },
          { headers: NO_STORE_HEADERS }
        );
      }
      webhookRecordId = existingEvent.id;
    }

    const claimAcquired = await claimStripeWebhookEvent({
      eventId: event.id,
      webhookRecordId,
    });
    if (!claimAcquired) {
      return NextResponse.json(
        { received: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleMerchCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session
          );
          break;
        case 'charge.refunded':
          await handleMerchChargeRefunded(event.data.object as Stripe.Charge);
          break;
        default:
          logger.info(`[merch] Unhandled Stripe merch event: ${event.type}`);
      }

      await db
        .update(stripeWebhookEvents)
        .set({ processedAt: new Date(), processingStartedAt: null })
        .where(eq(stripeWebhookEvents.id, webhookRecordId));
    } catch (processingError) {
      await clearStripeWebhookClaim(webhookRecordId);
      throw processingError;
    }

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[merch] Stripe merch webhook failed', { error });
    await captureCriticalError('Stripe merch webhook failed', error, {
      route: '/api/webhooks/stripe-merch',
      eventType: event.type,
      eventId: event.id,
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
