/**
 * Checkout Session Expired Handler
 *
 * Handles Stripe checkout.session.expired webhook events.
 * This event fires when a checkout session times out without payment —
 * the user reached the payment page and bailed.
 *
 * Recovery path:
 * 1. Identify the user via session metadata (clerk_user_id, which carries
 *    the app `users.id` UUID post-cutover) or Stripe customer ID fallback
 * 2. Record a `checkout_abandoned` lead funnel event on the attributed lead
 *    so re-engagement and funnel reporting can pick the user up
 *
 * Unidentifiable sessions (anonymous abandons) are acknowledged and skipped —
 * there is no lead state to update and no durable contact to recover.
 */

import type Stripe from 'stripe';

import { attributeLeadCheckoutAbandonment } from '@/lib/leads/funnel-events';
import { extractCheckoutCorrelation } from '@/lib/stripe/checkout-correlation';
import { logger } from '@/lib/utils/logger';

import type {
  HandlerResult,
  SupportedEventType,
  WebhookContext,
  WebhookHandler,
} from '../types';
import { getCustomerId } from '../utils';

/**
 * Handler for checkout.session.expired events.
 *
 * @example
 * ```ts
 * const handler = new CheckoutSessionExpiredHandler();
 * const result = await handler.handle({
 *   event: stripeEvent,
 *   stripeEventId: 'evt_123',
 *   stripeEventTimestamp: new Date()
 * });
 * ```
 */
export class CheckoutSessionExpiredHandler implements WebhookHandler {
  /**
   * Event types handled by this handler.
   */
  readonly eventTypes: readonly SupportedEventType[] = [
    'checkout.session.expired',
  ] as const;

  /**
   * Process a checkout.session.expired webhook event.
   *
   * @param context - Webhook context containing the event and metadata
   * @returns Handler result indicating success, skip, or error
   * @throws If the funnel event write fails (leaves event unprocessed for retry)
   */
  async handle(context: WebhookContext): Promise<HandlerResult> {
    const { event } = context;
    const session = event.data.object as Stripe.Checkout.Session;

    const result = await attributeLeadCheckoutAbandonment({
      userIdentity: session.metadata?.clerk_user_id,
      stripeCustomerId: getCustomerId(session.customer),
      stripeSessionId: session.id,
      correlation: extractCheckoutCorrelation(session.metadata),
    });

    if (!result.recorded) {
      logger.info(
        '[Stripe Webhook] Expired checkout session had no recoverable lead',
        {
          eventId: event.id,
          reason: result.reason,
        }
      );
      return { success: true, skipped: true, reason: result.reason };
    }

    logger.info('[Stripe Webhook] Recorded abandoned checkout for lead', {
      eventId: event.id,
    });
    return { success: true };
  }
}

/**
 * Singleton instance of the CheckoutSessionExpiredHandler.
 * Use this for handler registration to avoid creating multiple instances.
 */
export const checkoutSessionExpiredHandler =
  new CheckoutSessionExpiredHandler();
