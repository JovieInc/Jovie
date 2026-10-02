import type Stripe from 'stripe';
import { captureCriticalError } from '@/lib/error-tracking';
import { getHandler, type WebhookContext } from '@/lib/stripe/webhooks';
import { logger } from '@/lib/utils/logger';

/**
 * Dispatch one signature-verified Stripe event through the billing registry.
 *
 * Unhandled types are acknowledged. Handler failures throw so the caller can
 * leave `processed_at` null and retry. This does not verify signatures and
 * must only see events that already passed `constructEvent` or were stored
 * after that check.
 */
export async function processVerifiedStripeEvent(
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
