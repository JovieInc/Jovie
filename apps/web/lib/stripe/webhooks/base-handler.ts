/**
 * Base Subscription Handler
 *
 * Abstract base class for webhook handlers that process subscription-related events.
 * Provides shared subscription processing logic for determining billing status updates.
 *
 * Usage:
 * - Extend this class for subscription-related handlers
 * - Call processSubscription() for consistent subscription state handling
 * - Override handle() to implement event-specific logic
 */

import type Stripe from 'stripe';

import { captureCriticalError } from '@/lib/error-tracking';
import { getPlanFromPriceId } from '@/lib/stripe/config';
import {
  type BillingAuditEventType,
  updateUserBillingStatus,
} from '@/lib/stripe/customer-sync';

import type {
  HandlerResult,
  SupportedEventType,
  WebhookHandler,
} from './types';
import { getCustomerId, isActiveSubscription } from './utils';

/**
 * Result of processing a subscription for billing status.
 * Extends HandlerResult with additional subscription-specific context.
 */
export interface ProcessSubscriptionResult extends HandlerResult {
  /** The plan that was assigned (if subscription is active) */
  plan?: string;

  /** Whether the subscription is currently active */
  isActive?: boolean;
}

/**
 * Options for processing a subscription.
 */
export interface ProcessSubscriptionOptions {
  /** The Stripe subscription object to process */
  subscription: Stripe.Subscription;

  /** The Clerk user ID to update */
  userId: string;

  /** Stripe event ID for idempotency and audit logging */
  stripeEventId: string;

  /** When the Stripe event was created (for event ordering) */
  stripeEventTimestamp: Date;

  /** The type of event that triggered this processing */
  eventType: BillingAuditEventType;
}

/**
 * Abstract base class for subscription-related webhook handlers.
 *
 * Provides shared logic for processing subscription state changes and
 * updating user billing status accordingly. Concrete handlers should
 * extend this class and implement the handle() method.
 *
 * @example
 * ```ts
 * class SubscriptionHandler extends BaseSubscriptionHandler {
 *   readonly eventTypes = ['customer.subscription.updated'] as const;
 *
 *   async handle(context: WebhookContext): Promise<HandlerResult> {
 *     const subscription = context.event.data.object as Stripe.Subscription;
 *     // ... extract userId from metadata or fallback lookup
 *     return this.processSubscription({ ... });
 *   }
 * }
 * ```
 */
export abstract class BaseSubscriptionHandler implements WebhookHandler {
  /**
   * Event types this handler processes.
   * Must be defined by concrete implementations.
   */
  abstract readonly eventTypes: readonly SupportedEventType[];

  /**
   * Handle a webhook event.
   * Must be implemented by concrete handlers.
   */
  abstract handle(context: {
    event: Stripe.Event;
    stripeEventId: string;
    stripeEventTimestamp: Date;
  }): Promise<HandlerResult>;

  /**
   * Process a subscription and update user billing status.
   *
   * This method encapsulates the core logic for determining whether a subscription
   * grants pro access and updating the user's billing state accordingly:
   *
   * 1. Checks if subscription is active (status: 'active' or 'trialing')
   * 2. If not active: Downgrades user (isPro = false)
   * 3. If active: Validates price ID, looks up plan, upgrades user (isPro = true)
   *
   * Error Handling:
   * - Throws on unrecoverable errors (missing price ID, unknown plan)
   * - Returns error result on billing update failures
   *
   * @param options - Processing options including subscription, user ID, and event metadata
   * @returns Promise resolving to the processing result
   * @throws If price ID is missing or unknown (unrecoverable errors)
   */
  protected async processSubscription(
    options: ProcessSubscriptionOptions
  ): Promise<ProcessSubscriptionResult> {
    const {
      subscription,
      userId,
      stripeEventId,
      stripeEventTimestamp,
      eventType,
    } = options;

    // Determine if subscription is active
    const isActive = isActiveSubscription(subscription.status);

    if (!isActive) {
      // Subscription is not active, downgrade user
      return this.handleInactiveSubscription(
        subscription,
        userId,
        stripeEventId,
        stripeEventTimestamp,
        eventType
      );
    }

    // Subscription is active, upgrade user
    return this.handleActiveSubscription(
      subscription,
      userId,
      stripeEventId,
      stripeEventTimestamp,
      eventType
    );
  }

  /**
   * Handle an inactive subscription by downgrading the user.
   *
   * @private
   */
  private async handleInactiveSubscription(
    subscription: Stripe.Subscription,
    userId: string,
    stripeEventId: string,
    stripeEventTimestamp: Date,
    eventType: BillingAuditEventType
  ): Promise<ProcessSubscriptionResult> {
    // Determine the appropriate event type for downgrade
    const downgradeEventType: BillingAuditEventType =
      eventType === 'payment_failed'
        ? 'payment_failed'
        : 'subscription_downgraded';

    const customerId = getCustomerId(subscription.customer);
    const result = await updateUserBillingStatus({
      clerkUserId: userId,
      isPro: false,
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: null,
      stripeEventId,
      stripeEventTimestamp,
      eventType: downgradeEventType,
      source: 'webhook',
      metadata: {
        subscriptionStatus: subscription.status,
      },
    });

    if (!result.success && !result.skipped) {
      await captureCriticalError(
        'Failed to downgrade inactive subscription',
        new Error(result.error || 'Unknown error'),
        {
          userId,
          subscriptionStatus: subscription.status,
          route: '/api/stripe/webhooks',
        }
      );
      throw new Error(`Failed to downgrade user: ${result.error}`);
    }

    return {
      success: true,
      isActive: false,
      skipped: result.skipped,
      reason: result.reason,
    };
  }

  /**
   * Handle an active subscription by upgrading the user.
   *
   * @private
   * @throws If price ID is missing or unknown
   */
  private async handleActiveSubscription(
    subscription: Stripe.Subscription,
    userId: string,
    stripeEventId: string,
    stripeEventTimestamp: Date,
    eventType: BillingAuditEventType
  ): Promise<ProcessSubscriptionResult> {
    // Get the price ID from the subscription to determine the plan
    const priceId = subscription.items.data[0]?.price.id;
    if (!priceId) {
      await captureCriticalError(
        'No price ID found in subscription',
        new Error('Missing price ID'),
        {
          userId,
          route: '/api/stripe/webhooks',
        }
      );
      throw new Error('No price ID in subscription');
    }

    const plan = getPlanFromPriceId(priceId);
    if (!plan) {
      await captureCriticalError(
        'Unknown price ID in subscription',
        new Error(`Unknown price ID: ${priceId}`),
        {
          priceId,
          userId,
          route: '/api/stripe/webhooks',
        }
      );
      throw new Error(`Unknown price ID: ${priceId}`);
    }

    // Update user's billing status
    const customerId = getCustomerId(subscription.customer);
    const result = await updateUserBillingStatus({
      clerkUserId: userId,
      isPro: true,
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: subscription.id,
      stripeEventId,
      stripeEventTimestamp,
      eventType,
      source: 'webhook',
      metadata: {
        plan,
        priceId,
        subscriptionStatus: subscription.status,
      },
    });

    if (!result.success && !result.skipped) {
      await captureCriticalError(
        'Failed to update user billing status',
        new Error(result.error || 'Unknown error'),
        {
          userId,
          plan,
          route: '/api/stripe/webhooks',
        }
      );
      throw new Error(`Failed to update billing status: ${result.error}`);
    }

    return {
      success: true,
      isActive: true,
      plan,
      skipped: result.skipped,
      reason: result.reason,
    };
  }
}
