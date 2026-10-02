import { and, asc, eq, isNull, lt, or } from 'drizzle-orm';
import type Stripe from 'stripe';
import { fileBillingWebhookRemediationIssue } from '@/lib/billing/webhook-remediation-issue';
import { db } from '@/lib/db';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import {
  handleMerchChargeRefunded,
  handleMerchCheckoutCompleted,
} from '@/lib/merch/orders';
import { logger } from '@/lib/utils/logger';
import { processVerifiedStripeEvent } from './process-verified-event';

const REPROCESS_BATCH = 20;
const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;

/**
 * Event types whose normal handler can change `isPro` or the stored
 * subscription id. Logged before that handler runs.
 */
const SUBSCRIPTION_STATE_EVENT_TYPES = new Set<string>([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'checkout.session.completed',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
]);

export interface WebhookReprocessStats {
  examined: number;
  processed: number;
  failed: number;
  released: number;
  subscriptionStateEventIds: string[];
}

interface StoredWebhookRow {
  id: string;
  stripeEventId: string;
  type: string;
  payload: unknown;
  stripeCreatedAt: Date | null;
  createdAt: Date;
}

/**
 * Replay unprocessed `stripe_webhook_events` through the idempotent handler.
 *
 * Rows exist only after signature verification. Claim with the same lease the
 * live route uses so a Stripe retry and this cron cannot both apply one event.
 * Merch checkouts stay on the merch handler. Billing checkout must not grant
 * Pro for a merch session.
 */
export async function reprocessUnprocessedStripeWebhookEvents(): Promise<WebhookReprocessStats> {
  const stats: WebhookReprocessStats = {
    examined: 0,
    processed: 0,
    failed: 0,
    released: 0,
    subscriptionStateEventIds: [],
  };

  try {
    const leaseCutoff = new Date(Date.now() - WEBHOOK_PROCESSING_LEASE_MS);
    const rows = await db
      .select({
        id: stripeWebhookEvents.id,
        stripeEventId: stripeWebhookEvents.stripeEventId,
        type: stripeWebhookEvents.type,
        payload: stripeWebhookEvents.payload,
        stripeCreatedAt: stripeWebhookEvents.stripeCreatedAt,
        createdAt: stripeWebhookEvents.createdAt,
      })
      .from(stripeWebhookEvents)
      .where(
        and(
          isNull(stripeWebhookEvents.processedAt),
          or(
            isNull(stripeWebhookEvents.processingStartedAt),
            lt(stripeWebhookEvents.processingStartedAt, leaseCutoff)
          )
        )
      )
      .orderBy(asc(stripeWebhookEvents.createdAt))
      .limit(REPROCESS_BATCH);

    for (const row of rows) {
      stats.examined += 1;
      await replayOne(row, stats);
    }
  } catch (error) {
    stats.failed += 1;
    logger.error('[billing-webhooks] unprocessed replay query failed', {
      error,
    });
  }

  if (stats.examined > 0 || stats.failed > 0) {
    await fileBillingWebhookRemediationIssue({
      examined: stats.examined,
      processed: stats.processed,
      failed: stats.failed,
      subscriptionStateEventIds: stats.subscriptionStateEventIds,
    });
  }

  logger.info('[billing-webhooks] unprocessed replay finished', stats);
  return stats;
}

async function replayOne(
  row: StoredWebhookRow,
  stats: WebhookReprocessStats
): Promise<void> {
  const event = storedPayloadToEvent(row);
  if (!event) {
    stats.failed += 1;
    logger.error(
      '[billing-webhooks] stored webhook payload is not replayable',
      {
        stripeEventId: row.stripeEventId,
        eventType: row.type,
      }
    );
    return;
  }

  const merchCheckout = isMerchCheckout(event);
  const wouldChangeSubscriptionState =
    SUBSCRIPTION_STATE_EVENT_TYPES.has(event.type) && !merchCheckout;
  if (wouldChangeSubscriptionState) {
    stats.subscriptionStateEventIds.push(event.id);
  }
  logger.info('[billing-webhooks] reprocessing stored event', {
    stripeEventId: event.id,
    eventType: event.type,
    createdAt: row.createdAt.toISOString(),
    wouldChangeSubscriptionState,
    merchCheckout,
  });

  const leaseStartedAt = new Date();
  const claimed = await claimRow(row, leaseStartedAt);
  if (!claimed) {
    stats.released += 1;
    return;
  }

  try {
    await dispatchReprocessedEvent(event, row.stripeCreatedAt ?? row.createdAt);
    const [processedRecord] = await db
      .update(stripeWebhookEvents)
      .set({ processedAt: new Date(), processingStartedAt: null })
      .where(
        and(
          eq(stripeWebhookEvents.id, row.id),
          eq(stripeWebhookEvents.processingStartedAt, leaseStartedAt),
          isNull(stripeWebhookEvents.processedAt)
        )
      )
      .returning({ id: stripeWebhookEvents.id });
    if (!processedRecord) {
      throw new Error('Webhook replay lost its processing lease');
    }
    stats.processed += 1;
  } catch (error) {
    stats.failed += 1;
    await releaseClaim(row.id, leaseStartedAt);
    logger.error('[billing-webhooks] stored webhook replay failed', {
      stripeEventId: row.stripeEventId,
      eventType: row.type,
      error,
    });
  }
}

async function claimRow(
  row: StoredWebhookRow,
  leaseStartedAt: Date
): Promise<boolean> {
  const leaseCutoff = new Date(
    leaseStartedAt.getTime() - WEBHOOK_PROCESSING_LEASE_MS
  );
  const [claimed] = await db
    .update(stripeWebhookEvents)
    .set({ processingStartedAt: leaseStartedAt })
    .where(
      and(
        eq(stripeWebhookEvents.id, row.id),
        eq(stripeWebhookEvents.stripeEventId, row.stripeEventId),
        isNull(stripeWebhookEvents.processedAt),
        or(
          isNull(stripeWebhookEvents.processingStartedAt),
          lt(stripeWebhookEvents.processingStartedAt, leaseCutoff)
        )
      )
    )
    .returning({ id: stripeWebhookEvents.id });
  return Boolean(claimed);
}

async function releaseClaim(
  webhookRecordId: string,
  leaseStartedAt: Date
): Promise<void> {
  try {
    await db
      .update(stripeWebhookEvents)
      .set({ processingStartedAt: null })
      .where(
        and(
          eq(stripeWebhookEvents.id, webhookRecordId),
          eq(stripeWebhookEvents.processingStartedAt, leaseStartedAt),
          isNull(stripeWebhookEvents.processedAt)
        )
      );
  } catch (error) {
    logger.warn('[billing-webhooks] replay lease release failed', {
      webhookRecordId,
      error,
    });
  }
}

async function dispatchReprocessedEvent(
  event: Stripe.Event,
  stripeCreatedAt: Date
): Promise<void> {
  if (isMerchCheckout(event)) {
    await handleMerchCheckoutCompleted(
      event.data.object as Stripe.Checkout.Session
    );
    return;
  }

  if (event.type === 'charge.refunded') {
    await handleMerchChargeRefunded(event.data.object as Stripe.Charge);
  }

  await processVerifiedStripeEvent(event, stripeCreatedAt);
}

function isMerchCheckout(event: Stripe.Event): boolean {
  if (event.type !== 'checkout.session.completed') return false;
  const session = event.data.object as Stripe.Checkout.Session;
  return Boolean(session.metadata?.merch_order_id);
}

function storedPayloadToEvent(row: StoredWebhookRow): Stripe.Event | null {
  if (!row.payload || typeof row.payload !== 'object') return null;
  const event = row.payload as Partial<Stripe.Event>;
  if (event.id !== row.stripeEventId || event.type !== row.type) return null;
  if (!event.data || typeof event.data !== 'object') return null;
  return event as Stripe.Event;
}
