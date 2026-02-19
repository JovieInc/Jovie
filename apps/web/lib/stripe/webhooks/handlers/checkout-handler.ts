/**
 * Checkout Session Handler
 *
 * Handles Stripe checkout.session.completed webhook events.
 * This event fires when a customer completes a checkout session
 * (i.e., successfully pays for a subscription).
 *
 * Processing flow:
 * 1. Extract user ID from session metadata (clerk_user_id)
 * 2. If metadata missing, fallback to customer ID lookup
 * 3. Retrieve the subscription from Stripe API
 * 4. Process subscription to update user billing status
 * 5. Invalidate billing cache
 */

import type Stripe from 'stripe';

import { captureCriticalError, logFallback } from '@/lib/error-tracking';
import { activateReferral, getInternalUserId } from '@/lib/referrals/service';
import { stripe } from '@/lib/stripe/client';
import { logger } from '@/lib/utils/logger';

import { BaseSubscriptionHandler } from '../base-handler';
import type {
  HandlerResult,
  SupportedEventType,
  WebhookContext,
} from '../types';
import { getUserIdFromStripeCustomer, invalidateBillingCache } from '../utils';

/**
 * Handler for checkout.session.completed events.
 *
 * When a customer completes checkout, this handler:
 * - Identifies the user via metadata or customer ID fallback
 * - Retrieves the subscription details from Stripe
 * - Updates the user's billing status to pro
 * - Invalidates billing cache for immediate UI updates
 *
 * @example
 * ```ts
 * const handler = new CheckoutSessionHandler();
 * const result = await handler.handle({
 *   event: stripeEvent,
 *   stripeEventId: 'evt_123',
 *   stripeEventTimestamp: new Date()
 * });
 * ```
 */
export class CheckoutSessionHandler extends BaseSubscriptionHandler {
  /**
   * Event types handled by this handler.
   */
  readonly eventTypes: readonly SupportedEventType[] = [
    'checkout.session.completed',
  ] as const;

  /**
   * Process a checkout.session.completed webhook event.
   *
   * @param context - Webhook context containing the event and metadata
   * @returns Handler result indicating success, skip, or error
   * @throws If user cannot be identified or subscription processing fails
   */
  async handle(context: WebhookContext): Promise<HandlerResult> {
    const { event, stripeEventId, stripeEventTimestamp } = context;
    const session = event.data.object as Stripe.Checkout.Session;

    // Extract user ID from session metadata
    let userId = session.metadata?.clerk_user_id;

    // Fallback: Look up user by Stripe customer ID if metadata is missing
    if (!userId && typeof session.customer === 'string') {
      await logFallback('No user ID in checkout session metadata', {
        event: 'checkout.session.completed',
      });
      userId =
        (await getUserIdFromStripeCustomer(session.customer)) ?? undefined;
    }

    if (!userId) {
      await captureCriticalError(
        'Cannot identify user for checkout session',
        new Error('Missing user ID in checkout session'),
        {
          route: '/api/stripe/webhooks',
          event: 'checkout.session.completed',
        }
      );
      throw new Error('Missing user ID in checkout session');
    }

    // Get subscription details to determine the plan
    // Checkout sessions for subscriptions always have a subscription ID
    if (!session.subscription) {
      // This might be a one-time payment checkout, skip processing
      return {
        success: true,
        skipped: true,
        reason: 'checkout_session_has_no_subscription',
      };
    }

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    // Retrieve full subscription from Stripe API
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Process subscription and update user billing status
    const result = await this.processSubscription({
      subscription,
      userId,
      stripeEventId,
      stripeEventTimestamp,
      eventType: 'subscription_created',
    });

    // Activate referral if this user was referred.
    // Awaited so failures are surfaced instead of silently dropped.
    try {
      const internalId = await getInternalUserId(userId);
      if (internalId) {
        await activateReferral(internalId);
      }
    } catch (error) {
      // Log but don't fail the webhook — referral activation is secondary
      logger.warn('Failed to activate referral on checkout', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Invalidate client cache
    await invalidateBillingCache();

    return result;
  }
}

/**
 * Singleton instance of the CheckoutSessionHandler.
 * Use this for handler registration to avoid creating multiple instances.
 */
export const checkoutSessionHandler = new CheckoutSessionHandler();
