/**
 * Customer Sync - Billing Status Update Functions
 *
 * Functions for updating user billing status with optimistic locking and retry logic.
 */

import 'server-only';
import { applyBillingUpdateWithAudit } from '@/lib/db/billing-status';
import { captureCriticalError, captureWarning } from '@/lib/error-tracking';
import { fetchUserBillingDataByIdentity } from './queries';
import {
  BILLING_FIELDS_STATUS,
  type UpdateBillingStatusOptions,
  type UpdateBillingStatusResult,
} from './types';

/**
 * Small delay utility for retry backoff.
 *
 * @internal
 * @param ms - Number of milliseconds to delay
 * @returns Promise that resolves after the delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if event is stale compared to last processed event.
 *
 * Uses strict less-than (`<`) rather than `<=` so that events sharing
 * the same Stripe `created` timestamp are NOT treated as stale.
 * Stripe frequently emits `checkout.session.completed` and
 * `customer.subscription.created` in the same second; skipping one
 * of them would leave the user's billing status out of date.
 */
function isEventStale(
  eventTimestamp: Date | undefined,
  lastEventAt: Date | null | undefined
): boolean {
  if (!eventTimestamp || !lastEventAt) return false;
  return eventTimestamp < lastEventAt;
}

/**
 * Update user's billing status in the database.
 *
 * This function uses fetchUserBillingData internally with BILLING_FIELDS_STATUS
 * to efficiently query only the fields needed for update operations.
 *
 * Called from webhooks when subscription status changes. Implements robust
 * update semantics with:
 * - Optimistic locking via billingVersion to prevent concurrent webhook overwrites
 * - Event ordering via lastBillingEventAt to skip stale webhook events
 * - Audit logging for all subscription state changes
 * - Automatic retry with exponential backoff on lock conflicts
 *
 * @param options - Update options including clerkUserId, isPro status, and event metadata
 * @param options.clerkUserId - Stripe metadata identity. Supports a legacy
 * Clerk user ID or a Better Auth app `users.id` UUID.
 * @param options.isPro - The new Pro subscription status
 * @param options.stripeCustomerId - Optional Stripe customer ID to set
 * @param options.stripeSubscriptionId - Optional Stripe subscription ID (null to clear)
 * @param options.stripeEventId - Optional Stripe event ID for audit logging
 * @param options.stripeEventTimestamp - Optional event timestamp for ordering
 * @param options.eventType - Type of billing event (defaults to 'subscription_updated')
 * @param options.source - Event source: 'webhook', 'reconciliation', or 'manual'
 * @param options.metadata - Additional metadata for audit logging
 * @returns Promise with success status, or skipped flag if event was out of order
 *
 * @example
 * // From a webhook handler
 * const result = await updateUserBillingStatus({
 *   clerkUserId: 'user_123',
 *   isPro: true,
 *   stripeSubscriptionId: 'sub_xyz',
 *   stripeEventId: 'evt_abc',
 *   stripeEventTimestamp: new Date(event.created * 1000),
 *   eventType: 'subscription_created',
 * });
 *
 * if (result.skipped) {
 *   console.log('Stale event skipped:', result.reason);
 * }
 */
export async function updateUserBillingStatus(
  options: UpdateBillingStatusOptions
): Promise<UpdateBillingStatusResult> {
  const {
    clerkUserId,
    isPro,
    plan,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId,
    stripeEventId,
    stripeEventTimestamp,
    eventType = 'subscription_updated',
    source = 'webhook',
    metadata = {},
  } = options;

  const effectivePlan = plan ?? (isPro ? 'pro' : 'free');

  try {
    const userResult = await fetchUserBillingDataByIdentity({
      userIdentity: clerkUserId,
      fields: BILLING_FIELDS_STATUS,
    });

    if (!userResult.success || !userResult.data) {
      return { success: false, error: userResult.error ?? 'User not found' };
    }

    const currentUser = userResult.data;

    // Event ordering: Skip if this event is older than the last processed event
    if (isEventStale(stripeEventTimestamp, currentUser.lastBillingEventAt)) {
      return {
        success: true,
        appUserId: currentUser.id,
        skipped: true,
        reason: 'Event is older than last processed event',
      };
    }

    // Prepare previous state for audit log
    const previousState = {
      isPro: currentUser.isPro,
      plan: currentUser.plan,
      stripeCustomerId: currentUser.stripeCustomerId,
      stripeSubscriptionId: currentUser.stripeSubscriptionId,
      stripePriceId: currentUser.stripePriceId,
    };

    // Prepare new state for audit log
    const newState = {
      isPro,
      plan: effectivePlan,
      stripeCustomerId: stripeCustomerId ?? currentUser.stripeCustomerId,
      stripeSubscriptionId:
        stripeSubscriptionId === undefined
          ? currentUser.stripeSubscriptionId
          : stripeSubscriptionId,
      stripePriceId:
        stripePriceId === undefined ? currentUser.stripePriceId : stripePriceId,
    };

    const result = await applyBillingUpdateWithAudit({
      userId: currentUser.id,
      userIdentity: clerkUserId,
      expectedBillingVersion: currentUser.billingVersion,
      isPro,
      plan: effectivePlan,
      billingUpdatedAt: new Date(),
      stripeCustomerId: stripeCustomerId || undefined,
      stripeSubscriptionId,
      stripePriceId,
      lastBillingEventAt: stripeEventTimestamp,
      eventType,
      previousState,
      newState,
      stripeEventId,
      source,
      metadata,
    });

    if (!result) {
      return await retryUpdateWithFreshData(options);
    }

    return { success: true, appUserId: currentUser.id };
  } catch (error) {
    await captureCriticalError('Error updating user billing status', error, {
      clerkUserId,
      eventType,
      stripeEventId,
    });
    return { success: false, error: 'Failed to update billing status' };
  }
}

/**
 * Retry billing update with fresh data after optimistic lock failure.
 *
 * This function uses fetchUserBillingData internally with BILLING_FIELDS_STATUS
 * to get fresh user data before retrying the update.
 *
 * Called automatically by updateUserBillingStatus when an optimistic lock
 * conflict is detected. Implements exponential backoff with jitter to prevent
 * thundering herd problems when multiple webhooks arrive simultaneously.
 *
 * @internal
 * @param options - Same options as updateUserBillingStatus
 * @param retryCount - Current retry attempt (0-indexed), used for backoff calculation
 * @returns Promise with success status, or error after MAX_RETRIES exceeded
 */
async function retryUpdateWithFreshData(
  options: UpdateBillingStatusOptions,
  retryCount = 0
): Promise<UpdateBillingStatusResult> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 50;

  const {
    clerkUserId,
    isPro,
    plan,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId,
    stripeEventId,
    stripeEventTimestamp,
    eventType = 'subscription_updated',
    source = 'webhook',
    metadata = {},
  } = options;

  const effectivePlan = plan ?? (isPro ? 'pro' : 'free');

  try {
    // Add jittered exponential backoff before retry
    if (retryCount > 0) {
      const backoffMs = BASE_DELAY_MS * Math.pow(2, retryCount - 1);
      const jitter =
        (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) *
        backoffMs *
        0.5;
      await delay(backoffMs + jitter);
    }

    const freshUserResult = await fetchUserBillingDataByIdentity({
      userIdentity: clerkUserId,
      fields: BILLING_FIELDS_STATUS,
    });

    if (!freshUserResult.success || !freshUserResult.data) {
      return {
        success: false,
        error: freshUserResult.error ?? 'User not found on retry',
      };
    }

    const freshUser = freshUserResult.data;

    // Re-check event ordering with fresh data
    if (isEventStale(stripeEventTimestamp, freshUser.lastBillingEventAt)) {
      return {
        success: true,
        appUserId: freshUser.id,
        skipped: true,
        reason: 'Event is older than last processed event (on retry)',
      };
    }

    const previousState = {
      isPro: freshUser.isPro,
      plan: freshUser.plan,
      stripeCustomerId: freshUser.stripeCustomerId,
      stripeSubscriptionId: freshUser.stripeSubscriptionId,
      stripePriceId: freshUser.stripePriceId,
    };
    const newState = {
      isPro,
      plan: effectivePlan,
      stripeCustomerId: stripeCustomerId ?? freshUser.stripeCustomerId,
      stripeSubscriptionId:
        stripeSubscriptionId === undefined
          ? freshUser.stripeSubscriptionId
          : stripeSubscriptionId,
      stripePriceId:
        stripePriceId === undefined ? freshUser.stripePriceId : stripePriceId,
    };
    const result = await applyBillingUpdateWithAudit({
      userId: freshUser.id,
      userIdentity: clerkUserId,
      expectedBillingVersion: freshUser.billingVersion,
      isPro,
      plan: effectivePlan,
      billingUpdatedAt: new Date(),
      stripeCustomerId: stripeCustomerId || undefined,
      stripeSubscriptionId,
      stripePriceId,
      lastBillingEventAt: stripeEventTimestamp,
      eventType,
      previousState,
      newState,
      stripeEventId,
      source,
      metadata,
      retried: true,
      retryCount: retryCount + 1,
    });

    if (!result) {
      if (retryCount < MAX_RETRIES) {
        return retryUpdateWithFreshData(options, retryCount + 1);
      }

      await captureWarning(
        `Optimistic lock failed after ${MAX_RETRIES + 1} attempts - high contention`,
        undefined,
        { clerkUserId, stripeEventId, retryCount }
      );
      return {
        success: false,
        error: 'Concurrent update conflict - max retries exceeded',
      };
    }

    return { success: true, appUserId: freshUser.id };
  } catch (error) {
    await captureCriticalError('Error retrying billing status update', error, {
      clerkUserId,
      eventType,
      stripeEventId,
    });
    return {
      success: false,
      error: 'Failed to update billing status on retry',
    };
  }
}
