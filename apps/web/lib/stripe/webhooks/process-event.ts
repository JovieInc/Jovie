import type Stripe from 'stripe';
import { captureCriticalError } from '@/lib/error-tracking';
import { getHandler, type WebhookContext } from '@/lib/stripe/webhooks';
import { logger } from '@/lib/utils/logger';

/**
 * Process a verified Stripe event through the canonical webhook registry.
 *
 * Both live delivery and stored-event recovery use this function so replay
 * preserves handler idempotency and event-ordering behavior.
 */
export async function processStripeWebhookEvent(
  event: Stripe.Event,
  stripeCreatedAt: Date
): Promise<void> {
  const handler = getHandler(event.type);

  if (!handler) {
    logger.warn(
      `[Stripe Webhook] Received unexpected event type: ${event.type}`,
      { eventId: event.id, eventType: event.type }
    );
    return;
  }

  const context: WebhookContext = {
    event,
    stripeEventId: event.id,
    stripeEventTimestamp: stripeCreatedAt,
  };
  const result = await handler.handle(context);

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
