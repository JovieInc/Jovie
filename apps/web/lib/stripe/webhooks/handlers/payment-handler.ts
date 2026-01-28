/**
 * Payment/Invoice Handler
 *
 * Handles Stripe invoice webhook events for payment processing:
 * - invoice.payment_succeeded: Subscription payment collected successfully
 * - invoice.payment_failed: Subscription payment failed
 *
 * Processing flow:
 * 1. Extract subscription ID from invoice
 * 2. Retrieve subscription from Stripe API
 * 3. Extract user ID from subscription metadata (with fallback to customer lookup)
 * 4. Update user billing status based on payment result
 * 5. Invalidate billing cache
 *
 * Payment Failure Handling:
 * The handler downgrades users when the subscription enters any failure status:
 * - past_due: Payment is late but subscription is still technically active
 * - unpaid: Multiple payment attempts failed
 * - incomplete: Initial payment failed (new subscription)
 * - incomplete_expired: Initial payment failed and grace period expired
 */

import type Stripe from 'stripe';

import { captureCriticalError, logFallback } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';
import {
  sendPaymentFailedEmail,
  sendPaymentRecoveredEmail,
  shouldSendDunningEmail,
} from '@/lib/stripe/dunning';
import { logger } from '@/lib/utils/logger';

import { BaseSubscriptionHandler } from '../base-handler';
import type {
  HandlerResult,
  SupportedEventType,
  WebhookContext,
} from '../types';
import {
  getCustomerId,
  getUserIdFromStripeCustomer,
  invalidateBillingCache,
} from '../utils';

/**
 * Subscription statuses that indicate payment failure.
 * When a subscription enters any of these states, we should revoke pro access.
 */
const FAILURE_STATUSES = [
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
] as const;

type FailureStatus = (typeof FAILURE_STATUSES)[number];

/**
 * Handler for invoice payment events.
 *
 * This handler manages payment lifecycle:
 *
 * **Payment Succeeded**: When a subscription invoice is paid
 * - Confirms/restores pro access for the user
 * - Useful for recovering from past_due states
 *
 * **Payment Failed**: When a subscription invoice payment fails
 * - Logs the failure for monitoring
 * - Downgrades user if subscription enters failure status
 * - Handles multiple failure statuses (past_due, unpaid, incomplete, incomplete_expired)
 *
 * @example
 * ```ts
 * const handler = new PaymentHandler();
 * const result = await handler.handle({
 *   event: stripeEvent,
 *   stripeEventId: 'evt_123',
 *   stripeEventTimestamp: new Date()
 * });
 * ```
 */
export class PaymentHandler extends BaseSubscriptionHandler {
  /**
   * Event types handled by this handler.
   */
  readonly eventTypes: readonly SupportedEventType[] = [
    'invoice.payment_succeeded',
    'invoice.payment_failed',
  ] as const;

  /**
   * Process an invoice payment webhook event.
   *
   * Routes to the appropriate handler method based on event type.
   *
   * @param context - Webhook context containing the event and metadata
   * @returns Handler result indicating success, skip, or error
   * @throws If subscription processing fails
   */
  async handle(context: WebhookContext): Promise<HandlerResult> {
    const { event, stripeEventId, stripeEventTimestamp } = context;
    const invoice = event.data.object as Stripe.Invoice;

    switch (event.type) {
      case 'invoice.payment_succeeded':
        return this.handlePaymentSucceeded(
          invoice,
          stripeEventId,
          stripeEventTimestamp
        );

      case 'invoice.payment_failed':
        return this.handlePaymentFailed(
          invoice,
          stripeEventId,
          stripeEventTimestamp
        );

      default:
        // This should never happen due to eventTypes filtering
        return {
          success: true,
          skipped: true,
          reason: 'unhandled_event_type',
        };
    }
  }

  /**
   * Handle invoice.payment_succeeded event.
   *
   * When a subscription payment succeeds, ensures the user has pro access.
   * This is especially important for recovering from past_due states
   * where a subsequent successful payment should restore access.
   *
   * @private
   */
  private async handlePaymentSucceeded(
    invoice: Stripe.Invoice,
    stripeEventId: string,
    stripeEventTimestamp: Date
  ): Promise<HandlerResult> {
    // Extract subscription ID from invoice
    const subscriptionId = this.extractSubscriptionId(invoice);

    // Skip if this invoice is not for a subscription (e.g., one-time payment)
    if (!subscriptionId) {
      return {
        success: true,
        skipped: true,
        reason: 'invoice_has_no_subscription',
      };
    }

    try {
      // Retrieve full subscription from Stripe API
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.clerk_user_id;

      // Skip if we can't identify the user
      // Note: For payment_succeeded, we don't do fallback lookup since it's less critical
      // than payment_failed - the subscription.updated event will handle status changes
      if (!userId) {
        return {
          success: true,
          skipped: true,
          reason: 'no_user_id_in_subscription_metadata',
        };
      }

      // Process subscription to ensure user has correct billing status
      const result = await this.processSubscription({
        subscription,
        userId,
        stripeEventId,
        stripeEventTimestamp,
        eventType: 'payment_succeeded',
      });

      await invalidateBillingCache();

      // Check if this is a recovery from a failed payment (attempt_count > 1)
      // If so, send a recovery confirmation email
      if (invoice.attempt_count && invoice.attempt_count > 1) {
        const priceId = subscription.items.data[0]?.price?.id;
        sendPaymentRecoveredEmail({
          userId,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          priceId,
        }).catch(error => {
          logger.warn('Failed to send payment recovery email', {
            userId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      return result;
    } catch (error) {
      await captureCriticalError(
        'Error handling payment success webhook',
        error,
        {
          invoiceId: invoice.id,
          route: '/api/stripe/webhooks',
          event: 'invoice.payment_succeeded',
        }
      );
      // For payment succeeded, we don't throw - subscription.updated will handle it
      return {
        success: true,
        skipped: true,
        reason: 'error_processing_payment_success',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle invoice.payment_failed event.
   *
   * When a subscription payment fails:
   * 1. Log the failure for monitoring
   * 2. Check if subscription is in a failure status
   * 3. If in failure status, downgrade the user
   *
   * Failure statuses handled:
   * - past_due: Payment is late but subscription is still technically active
   * - unpaid: Multiple payment attempts failed
   * - incomplete: Initial payment failed (new subscription)
   * - incomplete_expired: Initial payment failed and grace period expired
   *
   * @private
   */
  private async handlePaymentFailed(
    invoice: Stripe.Invoice,
    stripeEventId: string,
    stripeEventTimestamp: Date
  ): Promise<HandlerResult> {
    // Log payment failure with safe metadata only (invoice ID is safe, no customer/subscription IDs)
    await captureCriticalError(
      'Payment failed for invoice',
      new Error('Invoice payment failed'),
      {
        invoiceId: invoice.id,
        amountDue: invoice.amount_due,
        attemptCount: invoice.attempt_count,
        route: '/api/stripe/webhooks',
        event: 'invoice.payment_failed',
      }
    );

    // Extract subscription ID from invoice
    const subscriptionId = this.extractSubscriptionId(invoice);

    // Skip if this invoice is not for a subscription (e.g., one-time payment)
    if (!subscriptionId) {
      return {
        success: true,
        skipped: true,
        reason: 'invoice_has_no_subscription',
      };
    }

    // Retrieve full subscription from Stripe API
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = await this.extractUserId(subscription);

    // Skip if we can't identify the user
    if (!userId) {
      return {
        success: true,
        skipped: true,
        reason: 'cannot_identify_user_for_payment_failure',
      };
    }

    // Check if subscription is in a failure status
    if (!this.isFailureStatus(subscription.status)) {
      // Subscription is still active/trialing, no action needed yet
      // Stripe will send more events if payment continues to fail
      return {
        success: true,
        skipped: true,
        reason: 'subscription_not_in_failure_status',
      };
    }

    // Subscription is in failure status - downgrade the user
    const customerId = getCustomerId(subscription.customer);
    const result = await updateUserBillingStatus({
      clerkUserId: userId,
      isPro: false,
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: null,
      stripeEventId,
      stripeEventTimestamp,
      eventType: 'payment_failed',
      source: 'webhook',
      metadata: {
        subscriptionStatus: subscription.status,
        invoiceId: invoice.id,
        amountDue: invoice.amount_due,
        attemptCount: invoice.attempt_count,
      },
    });

    if (!result.success && !result.skipped) {
      await captureCriticalError(
        'Failed to downgrade user after payment failure',
        new Error(result.error || 'Unknown error'),
        {
          userId,
          subscriptionStatus: subscription.status,
          route: '/api/stripe/webhooks',
          event: 'invoice.payment_failed',
        }
      );
      throw new Error(`Failed to downgrade user: ${result.error}`);
    }

    await invalidateBillingCache();

    // Send dunning email (fire-and-forget, don't block webhook response)
    if (shouldSendDunningEmail(invoice.attempt_count ?? 1)) {
      const priceId = subscription.items.data[0]?.price?.id;
      sendPaymentFailedEmail({
        userId,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        attemptCount: invoice.attempt_count ?? 1,
        invoiceId: invoice.id,
        priceId,
        customerId: customerId ?? undefined,
      }).catch(error => {
        logger.warn('Failed to send dunning email', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }

    return {
      success: true,
      skipped: result.skipped,
      reason: result.reason,
    };
  }

  /**
   * Extract subscription ID from an invoice.
   *
   * The subscription field can be:
   * - A string subscription ID
   * - An expanded Subscription object with an 'id' field
   * - null (for invoices not tied to a subscription)
   *
   * @param invoice - The Stripe invoice object
   * @returns The subscription ID if present, null otherwise
   * @private
   */
  private extractSubscriptionId(invoice: Stripe.Invoice): string | null {
    // Handle the subscription field which can be string | Subscription | null
    const raw = invoice as unknown as Record<string, unknown>;
    const subField = raw['subscription'];

    if (typeof subField === 'string') {
      return subField;
    }

    if (subField && typeof subField === 'object' && 'id' in subField) {
      const subObject = subField as { id?: unknown };
      if (typeof subObject.id === 'string') {
        return subObject.id;
      }
    }

    return null;
  }

  /**
   * Extract user ID from subscription metadata with fallback to customer lookup.
   *
   * @param subscription - The Stripe subscription object
   * @returns The Clerk user ID, or null if not found
   * @private
   */
  private async extractUserId(
    subscription: Stripe.Subscription
  ): Promise<string | null> {
    let userId: string | undefined = subscription.metadata?.clerk_user_id;

    // Fallback: Look up user by Stripe customer ID if metadata is missing
    if (!userId && typeof subscription.customer === 'string') {
      await logFallback(
        'No user ID in subscription metadata for payment failure',
        {
          event: 'invoice.payment_failed',
        }
      );
      userId =
        (await getUserIdFromStripeCustomer(subscription.customer)) ?? undefined;
    }

    return userId ?? null;
  }

  /**
   * Check if a subscription status is a failure status.
   *
   * @param status - The Stripe subscription status
   * @returns True if the status indicates payment failure
   * @private
   */
  private isFailureStatus(
    status: Stripe.Subscription.Status
  ): status is FailureStatus {
    return FAILURE_STATUSES.includes(status as FailureStatus);
  }
}

/**
 * Singleton instance of the PaymentHandler.
 * Use this for handler registration to avoid creating multiple instances.
 */
export const paymentHandler = new PaymentHandler();
