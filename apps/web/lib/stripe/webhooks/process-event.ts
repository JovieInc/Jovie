import type Stripe from 'stripe';
import { captureCriticalError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { getHandler } from './registry';
import type { WebhookContext } from './types';

/**
 * Process a stored or newly delivered Stripe event.
 *
 * Unhandled event types return without throwing so the caller can mark them
 * processed. Handlers throw on failure so the caller leaves processed_at null.
 * Replay passes stripeWritesAllowed false; live delivery leaves it allowed.
 */
export async function processStripeWebhookEvent(
  event: Stripe.Event,
  stripeCreatedAt: Date,
  options?: { stripeWritesAllowed?: boolean }
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
    stripeWritesAllowed: options?.stripeWritesAllowed,
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
