import { and, asc, eq, isNull, lt, or, type SQL } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import { merchOrders } from '@/lib/db/schema/merch';
import {
  handleMerchChargeRefunded,
  handleMerchCheckoutCompleted,
} from '@/lib/merch/orders';
import { processStripeWebhookEvent } from '@/lib/stripe/webhooks/process-event';
import { logger } from '@/lib/utils/logger';

const WEBHOOK_REDRIVE_AFTER_MS = 2 * 60 * 60 * 1000;
const WEBHOOK_PROCESSING_LEASE_MS = 10 * 60 * 1000;
const WEBHOOK_REDRIVE_LIMIT = 10;

interface ReplayRow {
  id: string;
  stripeEventId: string;
  type: string;
  payload: unknown;
  stripeCreatedAt: Date | null;
}

interface ReplayIssue {
  stripeEventId: string;
  type: string;
  reason: string;
}

export interface WebhookReplaySummary {
  processed: number;
  blocked: ReplayIssue[];
  failed: ReplayIssue[];
}

class ManualStripeReplayRequiredError extends Error {
  constructor(eventType: string) {
    super(
      `Replay requires Stripe Dashboard delivery because the canonical ${eventType} handler may cancel a live subscription`
    );
    this.name = 'ManualStripeReplayRequiredError';
  }
}

/** Re-drive stored webhook events through the canonical idempotent processors. */
export async function replayUnprocessedStripeWebhooks(
  now = new Date()
): Promise<WebhookReplaySummary> {
  const stuckBefore = new Date(now.getTime() - WEBHOOK_REDRIVE_AFTER_MS);
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
        claimable(now)
      )
    )
    .orderBy(asc(stripeWebhookEvents.createdAt))
    .limit(WEBHOOK_REDRIVE_LIMIT);

  const summary: WebhookReplaySummary = {
    processed: 0,
    blocked: [],
    failed: [],
  };

  for (const candidate of candidates) {
    await replayOne(candidate, now, summary);
  }

  return summary;
}

async function replayOne(
  candidate: ReplayRow,
  now: Date,
  summary: WebhookReplaySummary
): Promise<void> {
  const [claimed] = await db
    .update(stripeWebhookEvents)
    .set({ processingStartedAt: now })
    .where(
      and(
        eq(stripeWebhookEvents.id, candidate.id),
        isNull(stripeWebhookEvents.processedAt),
        claimable(now)
      )
    )
    .returning({ id: stripeWebhookEvents.id });

  if (!claimed) return;

  try {
    const event = parseStoredEvent(candidate);
    if (!event) {
      throw new Error('Stored webhook payload is not a valid Stripe event');
    }

    await dispatchStoredEvent(event);

    const [marked] = await db
      .update(stripeWebhookEvents)
      .set({ processedAt: now, processingStartedAt: null })
      .where(owned(candidate.id, now))
      .returning({ id: stripeWebhookEvents.id });

    if (!marked) {
      throw new Error('Webhook replay lease was lost before completion');
    }
    summary.processed++;
  } catch (error) {
    await db
      .update(stripeWebhookEvents)
      .set({ processingStartedAt: null })
      .where(owned(candidate.id, now));

    const reason = error instanceof Error ? error.message : String(error);
    const issue = {
      stripeEventId: candidate.stripeEventId,
      type: candidate.type,
      reason,
    };

    if (error instanceof ManualStripeReplayRequiredError) {
      summary.blocked.push(issue);
      return;
    }

    logger.warn('[billing-webhook-replay] stored event failed', issue);
    summary.failed.push(issue);
  }
}

function claimable(now: Date): SQL | undefined {
  const leaseCutoff = new Date(now.getTime() - WEBHOOK_PROCESSING_LEASE_MS);
  return or(
    isNull(stripeWebhookEvents.processingStartedAt),
    lt(stripeWebhookEvents.processingStartedAt, leaseCutoff)
  );
}

function owned(id: string, startedAt: Date): SQL | undefined {
  return and(
    eq(stripeWebhookEvents.id, id),
    eq(stripeWebhookEvents.processingStartedAt, startedAt),
    isNull(stripeWebhookEvents.processedAt)
  );
}

export function parseStoredEvent(candidate: {
  stripeEventId: string;
  type: string;
  payload: unknown;
  stripeCreatedAt: Date | null;
}): Stripe.Event | null {
  if (!candidate.payload || typeof candidate.payload !== 'object') return null;

  const payload = candidate.payload as Record<string, unknown>;
  if (
    payload.id !== candidate.stripeEventId ||
    payload.type !== candidate.type ||
    !payload.data ||
    typeof payload.data !== 'object'
  ) {
    return null;
  }

  const created =
    typeof payload.created === 'number'
      ? payload.created
      : candidate.stripeCreatedAt
        ? Math.floor(candidate.stripeCreatedAt.getTime() / 1000)
        : null;
  if (created === null) return null;

  return { ...(candidate.payload as Stripe.Event), created };
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

  if (
    event.type === 'charge.refunded' ||
    event.type === 'charge.dispute.created'
  ) {
    throw new ManualStripeReplayRequiredError(event.type);
  }

  await processStripeWebhookEvent(event, new Date(event.created * 1000));
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
