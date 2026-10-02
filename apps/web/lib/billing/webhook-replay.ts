import { and, asc, eq, isNull, lt, or } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import { merchOrders } from '@/lib/db/schema/merch';
import {
  handleMerchChargeRefunded,
  handleMerchCheckoutCompleted,
} from '@/lib/merch/orders';
import { StripeWriteBlockedError } from '@/lib/stripe/webhooks/handlers/charge-handler';
import { processStripeWebhookEvent } from '@/lib/stripe/webhooks/process-event';
import { logger } from '@/lib/utils/logger';
import { STUCK_WEBHOOK_AFTER_MS } from './sync-remediation-policy';

// Match the longer merch claim (10 min). The subscription route leases for 5.
const REPLAY_LEASE_MS = 10 * 60 * 1000;
const REPLAY_BATCH_LIMIT = 10;

export interface ReplayCandidate {
  id: string;
  stripeEventId: string;
  type: string;
  payload: unknown;
  stripeCreatedAt: Date | null;
}

export interface ReplayBlocked {
  stripeEventId: string;
  type: string;
  action: string;
}

export interface ReplayFailure {
  stripeEventId: string;
  type: string;
  error: string;
}

export interface ReplaySummary {
  processed: number;
  blocked: ReplayBlocked[];
  failed: ReplayFailure[];
}

/**
 * Replay stored Stripe events that never reached processed_at.
 *
 * Idempotent: a row with processed_at set is not selected, handlers are safe
 * to retry, and the claim lease matches the live webhook route. This path
 * does not call Stripe write APIs. A refund or dispute whose subscription is
 * still cancelable stays unprocessed and names the Dashboard cancel.
 */
export async function replayUnprocessedStripeWebhooks(
  now = new Date()
): Promise<ReplaySummary> {
  const stuckBefore = new Date(now.getTime() - STUCK_WEBHOOK_AFTER_MS);
  const leaseCutoff = new Date(now.getTime() - REPLAY_LEASE_MS);
  const candidates = await db
    .select({
      id: stripeWebhookEvents.id,
      stripeEventId: stripeWebhookEvents.stripeEventId,
      type: stripeWebhookEvents.type,
      payload: stripeWebhookEvents.payload,
      stripeCreatedAt: stripeWebhookEvents.stripeCreatedAt,
    })
    .from(stripeWebhookEvents)
    .where(
      and(
        isNull(stripeWebhookEvents.processedAt),
        lt(stripeWebhookEvents.createdAt, stuckBefore),
        or(
          isNull(stripeWebhookEvents.processingStartedAt),
          lt(stripeWebhookEvents.processingStartedAt, leaseCutoff)
        )
      )
    )
    .orderBy(asc(stripeWebhookEvents.createdAt))
    .limit(REPLAY_BATCH_LIMIT);

  const summary: ReplaySummary = { processed: 0, blocked: [], failed: [] };
  for (const candidate of candidates) {
    await replayOne(candidate, now, summary);
  }
  return summary;
}

async function replayOne(
  candidate: ReplayCandidate,
  now: Date,
  summary: ReplaySummary
): Promise<void> {
  const claimed = await claimReplay(candidate.id, now);
  if (!claimed) return;

  try {
    const event = parseStoredEvent(candidate);
    if (!event) {
      throw new Error('Stored webhook payload is not a Stripe event');
    }
    await dispatchStoredEvent(event);
    const marked = await db
      .update(stripeWebhookEvents)
      .set({ processedAt: new Date(), processingStartedAt: null })
      .where(
        and(
          eq(stripeWebhookEvents.id, candidate.id),
          eq(stripeWebhookEvents.processingStartedAt, now),
          isNull(stripeWebhookEvents.processedAt)
        )
      )
      .returning({ id: stripeWebhookEvents.id });
    if (marked.length === 0) {
      throw new Error('Replay lease was lost before the event was marked');
    }
    summary.processed += 1;
  } catch (error) {
    await releaseReplay(candidate.id, now);
    if (error instanceof StripeWriteBlockedError) {
      summary.blocked.push({
        stripeEventId: candidate.stripeEventId,
        type: candidate.type,
        action: error.message,
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[billing-webhook-replay] stored event failed', {
      stripeEventId: candidate.stripeEventId,
      type: candidate.type,
      error: message,
    });
    summary.failed.push({
      stripeEventId: candidate.stripeEventId,
      type: candidate.type,
      error: message,
    });
  }
}

async function claimReplay(id: string, now: Date): Promise<boolean> {
  const leaseCutoff = new Date(now.getTime() - REPLAY_LEASE_MS);
  const claimed = await db
    .update(stripeWebhookEvents)
    .set({ processingStartedAt: now })
    .where(
      and(
        eq(stripeWebhookEvents.id, id),
        isNull(stripeWebhookEvents.processedAt),
        or(
          isNull(stripeWebhookEvents.processingStartedAt),
          lt(stripeWebhookEvents.processingStartedAt, leaseCutoff)
        )
      )
    )
    .returning({ id: stripeWebhookEvents.id });
  return claimed.length > 0;
}

async function releaseReplay(id: string, startedAt: Date): Promise<void> {
  await db
    .update(stripeWebhookEvents)
    .set({ processingStartedAt: null })
    .where(
      and(
        eq(stripeWebhookEvents.id, id),
        eq(stripeWebhookEvents.processingStartedAt, startedAt),
        isNull(stripeWebhookEvents.processedAt)
      )
    );
}

export function parseStoredEvent(candidate: {
  stripeEventId: string;
  type: string;
  payload: unknown;
  stripeCreatedAt: Date | null;
}): Stripe.Event | null {
  const payload = candidate.payload;
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as {
    id?: unknown;
    type?: unknown;
    created?: unknown;
    data?: unknown;
  };
  if (typeof record.id !== 'string' || typeof record.type !== 'string') {
    return null;
  }
  if (record.id !== candidate.stripeEventId || record.type !== candidate.type) {
    return null;
  }
  if (!record.data || typeof record.data !== 'object') return null;
  const created =
    typeof record.created === 'number'
      ? record.created
      : candidate.stripeCreatedAt
        ? Math.floor(candidate.stripeCreatedAt.getTime() / 1000)
        : null;
  if (created === null) return null;
  return {
    ...(payload as Stripe.Event),
    id: record.id,
    created,
  };
}

async function dispatchStoredEvent(event: Stripe.Event): Promise<void> {
  if (isMerchCheckout(event)) {
    await handleMerchCheckoutCompleted(
      event.data.object as Stripe.Checkout.Session
    );
    return;
  }
  if (event.type === 'charge.refunded' && (await isMerchRefund(event))) {
    await handleMerchChargeRefunded(event.data.object as Stripe.Charge);
    return;
  }
  const createdAt = new Date(event.created * 1000);
  await processStripeWebhookEvent(event, createdAt, {
    stripeWritesAllowed: false,
  });
}

function isMerchCheckout(event: Stripe.Event): boolean {
  if (event.type !== 'checkout.session.completed') return false;
  const session = event.data.object as {
    metadata?: { merch_order_id?: string };
  };
  return Boolean(session.metadata?.merch_order_id);
}

async function isMerchRefund(event: Stripe.Event): Promise<boolean> {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!paymentIntentId) return false;
  const [order] = await db
    .select({ id: merchOrders.id })
    .from(merchOrders)
    .where(eq(merchOrders.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  return Boolean(order);
}
