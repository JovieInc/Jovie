/**
 * Subscription Lifecycle Handler
 *
 * Handles Stripe subscription webhook events for the full lifecycle:
 * - customer.subscription.created: New subscription activated
 * - customer.subscription.updated: Subscription plan/status changed
 * - customer.subscription.deleted: Subscription cancelled/ended
 *
 * Processing flow for each event:
 * 1. Extract user ID from subscription metadata (clerk_user_id)
 * 2. If metadata missing, fallback to customer ID lookup
 * 3. Process subscription to update user billing status
 * 4. Invalidate billing cache
 */

import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import { captureCriticalError, logFallback } from '@/lib/error-tracking';
import {
  notifySlackCancellation,
  notifySlackUpgrade,
} from '@/lib/notifications/providers/slack';
import { expireReferralOnChurn } from '@/lib/referrals/service';
import { trackServerEvent } from '@/lib/server-analytics';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';

import { BaseSubscriptionHandler } from '../base-handler';
import {
  canCompleteIdempotentPostEffects,
  runActiveSubscriptionPostEffects,
} from '../post-activation';
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
 * Handler for subscription lifecycle events.
 *
 * This handler manages the complete subscription lifecycle:
 *
 * **Created**: When a new subscription is created (may overlap with checkout.session.completed)
 * - Identifies user and activates pro access
 * - Handles metadata fallback for legacy subscriptions
 *
 * **Updated**: When subscription changes (plan upgrade/downgrade, status change)
 * - Reprocesses subscription to update billing status
 * - Handles transitions like active -> past_due -> canceled
 *
 * **Deleted**: When subscription is permanently cancelled
 * - Revokes pro access immediately
 * - Records cancellation metadata for audit
 *
 * @example
 * ```ts
 * const handler = new SubscriptionHandler();
 * const result = await handler.handle({
 *   event: stripeEvent,
 *   stripeEventId: 'evt_123',
 *   stripeEventTimestamp: new Date()
 * });
 * ```
 */
export class SubscriptionHandler extends BaseSubscriptionHandler {
  /**
   * Event types handled by this handler.
   */
  readonly eventTypes: readonly SupportedEventType[] = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ] as const;

  /**
   * Process a subscription lifecycle webhook event.
   *
   * Routes to the appropriate handler method based on event type.
   *
   * @param context - Webhook context containing the event and metadata
   * @returns Handler result indicating success, skip, or error
   * @throws If user cannot be identified or subscription processing fails
   */
  async handle(context: WebhookContext): Promise<HandlerResult> {
    const { event, stripeEventId, stripeEventTimestamp } = context;
    const subscription = event.data.object as Stripe.Subscription;

    switch (event.type) {
      case 'customer.subscription.created':
        return this.handleCreated(
          subscription,
          stripeEventId,
          stripeEventTimestamp
        );

      case 'customer.subscription.updated':
        return this.handleUpdated(
          subscription,
          stripeEventId,
          stripeEventTimestamp
        );

      case 'customer.subscription.deleted':
        return this.handleDeleted(
          subscription,
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
   * Handle customer.subscription.created event.
   *
   * Activates pro access for the user when a new subscription is created.
   * This event may fire alongside checkout.session.completed for new signups.
   *
   * @private
   */
  private async handleCreated(
    subscription: Stripe.Subscription,
    stripeEventId: string,
    stripeEventTimestamp: Date
  ): Promise<HandlerResult> {
    // Skip subscriptions still awaiting initial payment.
    // Stripe fires `customer.subscription.created` before the first invoice is
    // paid, so the status is often `incomplete`.  Processing it would
    // incorrectly downgrade the user.  The `checkout.session.completed` or
    // `customer.subscription.updated` (→ active) event will handle activation.
    if (
      subscription.status === 'incomplete' ||
      subscription.status === 'incomplete_expired'
    ) {
      return {
        success: true,
        skipped: true,
        reason: `subscription_created_with_status_${subscription.status}`,
      };
    }

    const userId = await this.extractUserId(
      subscription,
      'customer.subscription.created'
    );

    const result = await this.processSubscription({
      subscription,
      userId,
      stripeEventId,
      stripeEventTimestamp,
      eventType: 'subscription_created',
    });

    if (result.success && !result.skipped && result.isActive && result.plan) {
      if (!result.appUserId) {
        throw new Error('Billing update omitted canonical app user ID');
      }
      this.sendUpgradeNotification(result.appUserId, result.plan).catch(err => {
        logger.warn('[subscription-handler] Slack notification failed', err);
      });
    }

    await invalidateBillingCache(result.appUserId ?? userId);

    if (canCompleteIdempotentPostEffects(result) && result.isActive) {
      if (!result.appUserId) {
        throw new Error('Billing update omitted canonical app user ID');
      }
      await runActiveSubscriptionPostEffects({
        appUserId: result.appUserId,
        userId,
        subscription,
        plan: result.plan,
        correlation: result.correlation,
        stripeEventTimestamp,
        skipWelcomeEmail: Boolean(result.skipped),
        eventName: 'customer.subscription.created',
      });
    }

    return result;
  }

  /**
   * Send a Slack notification for a subscription upgrade.
   * Fetches user name from database and sends notification.
   *
   * @private
   */
  private async sendUpgradeNotification(
    appUserId: string,
    plan: string
  ): Promise<void> {
    const displayName = await this.getUserDisplayName(appUserId);
    const planName = getPlanDisplayName(plan);

    await notifySlackUpgrade(displayName, planName);
  }

  /**
   * Send a Slack notification for a subscription cancellation/downgrade.
   * Fetches user name from database and sends notification.
   *
   * @private
   */
  private async sendCancellationNotification(
    appUserId: string | undefined
  ): Promise<void> {
    const displayName = await this.getUserDisplayName(appUserId);
    await notifySlackCancellation(displayName);
  }

  /**
   * Fetch a user's display name for founder-facing notifications.
   *
   * @private
   */
  private async getUserDisplayName(
    appUserId: string | undefined
  ): Promise<string> {
    if (!appUserId) {
      return 'A user';
    }

    const [userData] = await db
      .select({
        email: users.email,
        displayName: creatorProfiles.displayName,
      })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
      .where(eq(users.id, appUserId))
      .limit(1);

    return userData?.displayName ?? userData?.email ?? 'A user';
  }

  /**
   * Handle customer.subscription.updated event.
   *
   * Reprocesses subscription to update billing status when:
   * - Plan is upgraded or downgraded
   * - Status changes (active -> past_due -> canceled)
   * - Other subscription properties change
   *
   * @private
   */
  private async handleUpdated(
    subscription: Stripe.Subscription,
    stripeEventId: string,
    stripeEventTimestamp: Date
  ): Promise<HandlerResult> {
    const userId = await this.extractUserId(
      subscription,
      'customer.subscription.updated'
    );

    const result = await this.processSubscription({
      subscription,
      userId,
      stripeEventId,
      stripeEventTimestamp,
      eventType: 'subscription_updated',
    });

    // Notify founders when an update downgrades the user off a paid plan
    // (fire-and-forget — the alert must not fail the webhook).
    if (result.success && !result.skipped && result.isActive === false) {
      this.sendCancellationNotification(result.appUserId).catch(err => {
        logger.warn(
          '[subscription-handler] Slack cancellation notification failed',
          err
        );
      });
    }

    await invalidateBillingCache(result.appUserId ?? userId);

    if (canCompleteIdempotentPostEffects(result) && result.isActive) {
      if (!result.appUserId) {
        throw new Error('Billing update omitted canonical app user ID');
      }
      await runActiveSubscriptionPostEffects({
        appUserId: result.appUserId,
        userId,
        subscription,
        plan: result.plan,
        correlation: result.correlation,
        stripeEventTimestamp,
        skipWelcomeEmail: Boolean(result.skipped),
        eventName: 'customer.subscription.updated',
      });
    }

    return result;
  }

  /**
   * Handle customer.subscription.deleted event.
   *
   * Immediately revokes pro access when a subscription is permanently cancelled.
   * Records cancellation metadata for audit trail.
   *
   * @private
   */
  private async handleDeleted(
    subscription: Stripe.Subscription,
    stripeEventId: string,
    stripeEventTimestamp: Date
  ): Promise<HandlerResult> {
    const userId = await this.extractUserId(
      subscription,
      'customer.subscription.deleted'
    );

    const customerId = getCustomerId(subscription.customer);
    const result = await updateUserBillingStatus({
      clerkUserId: userId,
      isPro: false,
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: null,
      expectedSubscriptionId: subscription.id,
      stripePriceId: null,
      stripeEventId,
      stripeEventTimestamp,
      eventType: 'subscription_deleted',
      source: 'webhook',
      metadata: {
        subscriptionStatus: subscription.status,
        canceledAt: subscription.canceled_at,
      },
    });

    if (!result.success && !result.skipped) {
      await captureCriticalError(
        'Failed to downgrade user on subscription deletion',
        new Error(result.error || 'Unknown error'),
        {
          userId,
          route: '/api/stripe/webhooks',
          event: 'customer.subscription.deleted',
        }
      );
      throw new Error(`Failed to downgrade user: ${result.error}`);
    }

    if (!result.skipped) {
      const churnDelivery = await trackServerEvent(
        'subscription_churned',
        { stripeEventId },
        undefined,
        {
          eventIdentity: `stripe:${stripeEventId}`,
          occurredAt: stripeEventTimestamp,
        }
      );
      if (!churnDelivery.ok) {
        throw new Error(
          `Churn analytics delivery failed: ${churnDelivery.error}`
        );
      }

      try {
        if (result.appUserId) {
          await expireReferralOnChurn(result.appUserId);
        }
      } catch (error) {
        logger.warn('Failed to expire referral on subscription deletion', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      this.sendCancellationNotification(result.appUserId).catch(err => {
        logger.warn(
          '[subscription-handler] Slack cancellation notification failed',
          err
        );
      });
    }

    await invalidateBillingCache(result.appUserId ?? userId);

    return {
      success: true,
      skipped: result.skipped,
      reason: result.reason,
    };
  }

  private async extractUserId(
    subscription: Stripe.Subscription,
    eventType: string
  ): Promise<string> {
    let userId: string | undefined = subscription.metadata?.clerk_user_id;
    const customerId = getCustomerId(subscription.customer);

    if (!userId && customerId) {
      await logFallback('No user ID in subscription metadata', {
        event: eventType,
      });
      userId = (await getUserIdFromStripeCustomer(customerId)) ?? undefined;
    }

    if (!userId) {
      const errorMessage = this.getErrorMessageForEventType(eventType);
      await captureCriticalError(
        errorMessage,
        new Error('Missing user ID in subscription'),
        {
          route: '/api/stripe/webhooks',
          event: eventType,
        }
      );
      throw new Error('Missing user ID in subscription');
    }

    return userId;
  }

  /**
   * Get a descriptive error message based on event type.
   *
   * @param eventType - The Stripe event type
   * @returns Human-readable error message
   * @private
   */
  private getErrorMessageForEventType(eventType: string): string {
    switch (eventType) {
      case 'customer.subscription.created':
        return 'Cannot identify user for subscription creation';
      case 'customer.subscription.updated':
        return 'Cannot identify user for subscription update';
      case 'customer.subscription.deleted':
        return 'Cannot identify user for subscription deletion';
      default:
        return 'Cannot identify user for subscription event';
    }
  }
}

/**
 * Singleton instance of the SubscriptionHandler.
 * Use this for handler registration to avoid creating multiple instances.
 */
export const subscriptionHandler = new SubscriptionHandler();
