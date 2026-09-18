/**
 * Charge Refund / Dispute Handler
 *
 * Subscription webhooks previously ignored refunds and chargebacks, so a
 * customer could reverse the payment and keep Pro. This handler revokes
 * entitlement when a subscription charge is fully refunded or disputed.
 *
 * - charge.refunded: revoke when the latest subscription invoice is fully refunded
 * - charge.dispute.created: revoke any subscription-linked dispute immediately
 *
 * Route-level stripe_event_id uniqueness makes delivery idempotent. The
 * handler is also safe to retry: billing updates are event-ordered, and
 * Stripe cancel treats already-canceled subscriptions as success.
 *
 * Immediate Stripe cancellation is required for revenue correctness. Local
 * revoke alone leaves an active Stripe subscription that
 * customer.subscription.updated or hourly reconciliation can restore.
 */

import type Stripe from 'stripe';

import { captureCriticalError, logFallback } from '@/lib/error-tracking';
import { expireReferralOnChurn } from '@/lib/referrals/service';
import { stripe } from '@/lib/stripe/client';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';
import type { BillingAuditEventType } from '@/lib/stripe/customer-sync/types';
import { logger } from '@/lib/utils/logger';

import type {
  HandlerResult,
  SupportedEventType,
  WebhookContext,
  WebhookHandler,
} from '../types';
import {
  extractStripeObjectId,
  extractSubscriptionIdFromInvoice,
  getCustomerId,
  getUserIdFromStripeCustomer,
  invalidateBillingCache,
  isFullyRefundedCharge,
  isLatestSubscriptionInvoice,
} from '../utils';

const CANCELABLE_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
]);

/**
 * Handler for subscription charge refunds and disputes.
 */
export class ChargeHandler implements WebhookHandler {
  readonly eventTypes: readonly SupportedEventType[] = [
    'charge.refunded',
    'charge.dispute.created',
  ] as const;

  async handle(context: WebhookContext): Promise<HandlerResult> {
    const { event, stripeEventId, stripeEventTimestamp } = context;

    switch (event.type) {
      case 'charge.refunded':
        return this.handleRefunded(
          event.data.object as Stripe.Charge,
          stripeEventId,
          stripeEventTimestamp
        );

      case 'charge.dispute.created':
        return this.handleDisputeCreated(
          event.data.object as Stripe.Dispute,
          stripeEventId,
          stripeEventTimestamp
        );

      default:
        return {
          success: true,
          skipped: true,
          reason: 'unhandled_event_type',
        };
    }
  }

  /**
   * Full refund of the current subscription invoice revokes Pro.
   * Partial refunds and historical-invoice goodwill refunds are skipped.
   */
  private async handleRefunded(
    charge: Stripe.Charge,
    stripeEventId: string,
    stripeEventTimestamp: Date
  ): Promise<HandlerResult> {
    if (!isFullyRefundedCharge(charge)) {
      return {
        success: true,
        skipped: true,
        reason: 'partial_refund',
      };
    }

    return this.revokeForCharge({
      charge,
      stripeEventId,
      stripeEventTimestamp,
      eventType: 'charge_refunded',
      requireLatestInvoice: true,
      stripeEventName: 'charge.refunded',
    });
  }

  /**
   * Any dispute on a subscription charge revokes Pro immediately.
   * Historical invoices are included: a chargeback is hostile.
   */
  private async handleDisputeCreated(
    dispute: Stripe.Dispute,
    stripeEventId: string,
    stripeEventTimestamp: Date
  ): Promise<HandlerResult> {
    const charge = await this.resolveCharge(dispute.charge);
    if (!charge) {
      return {
        success: true,
        skipped: true,
        reason: 'dispute_has_no_charge',
      };
    }

    return this.revokeForCharge({
      charge,
      stripeEventId,
      stripeEventTimestamp,
      eventType: 'charge_disputed',
      requireLatestInvoice: false,
      stripeEventName: 'charge.dispute.created',
      extraMetadata: {
        disputeId: dispute.id,
        disputeStatus: dispute.status,
      },
    });
  }

  private async revokeForCharge(options: {
    charge: Stripe.Charge;
    stripeEventId: string;
    stripeEventTimestamp: Date;
    eventType: Extract<
      BillingAuditEventType,
      'charge_refunded' | 'charge_disputed'
    >;
    requireLatestInvoice: boolean;
    stripeEventName: 'charge.refunded' | 'charge.dispute.created';
    extraMetadata?: Record<string, unknown>;
  }): Promise<HandlerResult> {
    const {
      charge,
      stripeEventId,
      stripeEventTimestamp,
      eventType,
      requireLatestInvoice,
      stripeEventName,
      extraMetadata,
    } = options;

    const invoice = await this.resolveInvoice(charge);
    if (!invoice) {
      return {
        success: true,
        skipped: true,
        reason: 'charge_has_no_invoice',
      };
    }

    const subscriptionId = extractSubscriptionIdFromInvoice(invoice);
    if (!subscriptionId) {
      return {
        success: true,
        skipped: true,
        reason: 'invoice_has_no_subscription',
      };
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (
      requireLatestInvoice &&
      !isLatestSubscriptionInvoice(invoice, subscription)
    ) {
      return {
        success: true,
        skipped: true,
        reason: 'historical_invoice_refund',
      };
    }

    const userId = await this.extractUserId(
      subscription,
      charge,
      stripeEventName
    );
    if (!userId) {
      return {
        success: true,
        skipped: true,
        reason: 'cannot_identify_user_for_charge_reversal',
      };
    }

    const customerId = getCustomerId(subscription.customer);
    const result = await updateUserBillingStatus({
      clerkUserId: userId,
      isPro: false,
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeEventId,
      stripeEventTimestamp,
      eventType,
      source: 'webhook',
      metadata: {
        subscriptionStatus: subscription.status,
        invoiceId: invoice.id,
        chargeId: charge.id,
        amountRefunded: charge.amount_refunded,
        ...extraMetadata,
      },
    });

    if (!result.success && !result.skipped) {
      await captureCriticalError(
        'Failed to downgrade user after charge reversal',
        new Error(result.error || 'Unknown error'),
        {
          userId,
          route: '/api/stripe/webhooks',
          event: stripeEventName,
        }
      );
      throw new Error(`Failed to downgrade user: ${result.error}`);
    }

    if (result.skipped) {
      return {
        success: true,
        skipped: true,
        reason: result.reason,
      };
    }

    await this.cancelLiveSubscription(subscription);

    try {
      if (result.appUserId) {
        await expireReferralOnChurn(result.appUserId);
      }
    } catch (error) {
      logger.warn('Failed to expire referral on charge reversal', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    if (!result.appUserId) {
      throw new Error('Billing update omitted canonical app user ID');
    }
    await invalidateBillingCache(result.appUserId);

    return {
      success: true,
    };
  }

  private async resolveCharge(
    chargeField: Stripe.Dispute['charge']
  ): Promise<Stripe.Charge | null> {
    if (
      chargeField &&
      typeof chargeField === 'object' &&
      'object' in chargeField &&
      chargeField.object === 'charge'
    ) {
      return chargeField;
    }

    const chargeId = extractStripeObjectId(chargeField);
    if (!chargeId) {
      return null;
    }

    return stripe.charges.retrieve(chargeId);
  }

  /**
   * Stripe SDK v22 dropped Charge.invoice from the typed surface, but
   * webhook payloads and PaymentIntents still carry the invoice id.
   * Read it without inventing a typed field that does not exist.
   */
  private async resolveInvoice(
    charge: Stripe.Charge
  ): Promise<Stripe.Invoice | null> {
    const fromCharge = await this.coerceInvoice(Reflect.get(charge, 'invoice'));
    if (fromCharge) {
      return fromCharge;
    }

    const paymentIntentId = extractStripeObjectId(charge.payment_intent);
    if (!paymentIntentId) {
      return null;
    }

    const paymentIntent =
      typeof charge.payment_intent === 'object' && charge.payment_intent
        ? charge.payment_intent
        : await stripe.paymentIntents.retrieve(paymentIntentId);

    return this.coerceInvoice(Reflect.get(paymentIntent, 'invoice'));
  }

  private async coerceInvoice(
    invoiceField: unknown
  ): Promise<Stripe.Invoice | null> {
    if (!invoiceField) {
      return null;
    }

    if (
      typeof invoiceField === 'object' &&
      invoiceField !== null &&
      'object' in invoiceField &&
      invoiceField.object === 'invoice' &&
      'id' in invoiceField &&
      typeof invoiceField.id === 'string'
    ) {
      return invoiceField as Stripe.Invoice;
    }

    const invoiceId = extractStripeObjectId(invoiceField);
    if (!invoiceId) {
      return null;
    }

    return stripe.invoices.retrieve(invoiceId);
  }

  private async extractUserId(
    subscription: Stripe.Subscription,
    charge: Stripe.Charge,
    eventType: 'charge.refunded' | 'charge.dispute.created'
  ): Promise<string | null> {
    let userId: string | undefined = subscription.metadata?.clerk_user_id;
    const customerId =
      getCustomerId(subscription.customer) ?? getCustomerId(charge.customer);

    if (!userId && customerId) {
      await logFallback('No user ID in subscription metadata', {
        event: eventType,
      });
      userId = (await getUserIdFromStripeCustomer(customerId)) ?? undefined;
    }

    if (!userId) {
      await captureCriticalError(
        'Cannot identify user for charge reversal',
        new Error('Missing user ID for refund or dispute'),
        {
          route: '/api/stripe/webhooks',
          event: eventType,
        }
      );
    }

    return userId ?? null;
  }

  /**
   * Cancel the Stripe subscription so later webhooks and reconciliation
   * cannot restore Pro after a refund or chargeback.
   */
  private async cancelLiveSubscription(
    subscription: Stripe.Subscription
  ): Promise<void> {
    if (!CANCELABLE_STATUSES.has(subscription.status)) {
      return;
    }

    try {
      await stripe.subscriptions.cancel(subscription.id);
    } catch (error) {
      if (isAlreadyCanceledError(error)) {
        return;
      }
      throw error instanceof Error
        ? error
        : new Error('Failed to cancel refunded subscription');
    }
  }
}

const ALREADY_CANCELED_ERROR_CODES = new Set([
  'resource_missing',
  'subscription_already_canceled',
]);

function isAlreadyCanceledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code =
    'code' in error && typeof error.code === 'string' ? error.code : '';
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : '';

  return (
    ALREADY_CANCELED_ERROR_CODES.has(code) ||
    /already (?:been )?cancel+ed|no such subscription/i.test(message)
  );
}

/**
 * Singleton instance of the ChargeHandler.
 */
export const chargeHandler = new ChargeHandler();
