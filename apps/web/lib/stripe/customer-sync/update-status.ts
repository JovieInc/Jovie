/**
 * Customer Sync - Billing Status Update Functions
 *
 * Functions for updating user billing status with optimistic locking and retry logic.
 */

import 'server-only';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { billingAuditLog, users } from '@/lib/db/schema';
import { captureCriticalError, captureWarning } from '@/lib/error-tracking';
import { fetchUserBillingData } from './queries';
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
 * @param options.clerkUserId - The Clerk user ID to update
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
    stripeEventId,
    stripeEventTimestamp,
    eventType = 'subscription_updated',
    source = 'webhook',
    metadata = {},
  } = options;

  // Determine the plan to set: use provided plan, or default based on isPro
  const effectivePlan = plan ?? (isPro ? 'pro' : 'free');

  try {
    // First, get the current user state using consolidated query function
    const userResult = await fetchUserBillingData({
      clerkUserId,
      fields: BILLING_FIELDS_STATUS,
    });

    if (!userResult.success || !userResult.data) {
      return { success: false, error: userResult.error ?? 'User not found' };
    }

    const currentUser = userResult.data;

    // Event ordering: Skip if this event is older than the last processed event
    if (stripeEventTimestamp && currentUser.lastBillingEventAt) {
      if (stripeEventTimestamp <= currentUser.lastBillingEventAt) {
        return {
          success: true,
          skipped: true,
          reason: 'Event is older than last processed event',
        };
      }
    }

    // Prepare update data
    const updateData: Partial<typeof users.$inferInsert> = {
      isPro: isPro,
      plan: effectivePlan,
      billingUpdatedAt: new Date(),
    };

    if (stripeCustomerId) {
      updateData.stripeCustomerId = stripeCustomerId;
    }

    if (stripeSubscriptionId !== undefined) {
      updateData.stripeSubscriptionId = stripeSubscriptionId;
    }

    if (stripeEventTimestamp) {
      updateData.lastBillingEventAt = stripeEventTimestamp;
    }

    // Prepare previous state for audit log
    const previousState = {
      isPro: currentUser.isPro,
      plan: currentUser.plan,
      stripeCustomerId: currentUser.stripeCustomerId,
      stripeSubscriptionId: currentUser.stripeSubscriptionId,
    };

    // Prepare new state for audit log
    const newState = {
      isPro,
      plan: effectivePlan,
      stripeCustomerId: stripeCustomerId ?? currentUser.stripeCustomerId,
      stripeSubscriptionId:
        stripeSubscriptionId !== undefined
          ? stripeSubscriptionId
          : currentUser.stripeSubscriptionId,
    };

    // Optimistic locking: Only update if billingVersion hasn't changed
    const result = await db
      .update(users)
      .set({
        ...updateData,
        billingVersion: drizzleSql`${users.billingVersion} + 1`,
      })
      .where(
        and(
          eq(users.clerkId, clerkUserId),
          eq(users.billingVersion, currentUser.billingVersion)
        )
      )
      .returning({ id: users.id, billingVersion: users.billingVersion });

    if (result.length === 0) {
      // Optimistic lock failed - concurrent update detected
      // Retry once with fresh data
      return await retryUpdateWithFreshData(options);
    }

    // Log to audit table
    try {
      await db.insert(billingAuditLog).values({
        userId: currentUser.id,
        eventType,
        previousState,
        newState,
        stripeEventId,
        source,
        metadata: {
          ...metadata,
          clerkUserId,
          billingVersion: result[0].billingVersion,
        },
      });
    } catch (auditError) {
      // Audit log failure shouldn't fail the main operation
      await captureWarning('Failed to write billing audit log', auditError, {
        userId: currentUser.id,
        eventType,
        stripeEventId,
      });
    }

    return { success: true };
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
  const BASE_DELAY_MS = 50; // Start with 50ms delay

  const {
    clerkUserId,
    isPro,
    plan,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeEventId,
    stripeEventTimestamp,
    eventType = 'subscription_updated',
    source = 'webhook',
    metadata = {},
  } = options;

  // Determine the plan to set: use provided plan, or default based on isPro
  const effectivePlan = plan ?? (isPro ? 'pro' : 'free');

  try {
    // Add jittered exponential backoff before retry
    if (retryCount > 0) {
      const backoffMs = BASE_DELAY_MS * Math.pow(2, retryCount - 1);
      const jitter = Math.random() * backoffMs * 0.5; // Add up to 50% jitter
      await delay(backoffMs + jitter);
    }

    // Get fresh user state using consolidated query function
    const freshUserResult = await fetchUserBillingData({
      clerkUserId,
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
    if (stripeEventTimestamp && freshUser.lastBillingEventAt) {
      if (stripeEventTimestamp <= freshUser.lastBillingEventAt) {
        return {
          success: true,
          skipped: true,
          reason: 'Event is older than last processed event (on retry)',
        };
      }
    }

    // Prepare update data
    const updateData: Partial<typeof users.$inferInsert> = {
      isPro: isPro,
      plan: effectivePlan,
      billingUpdatedAt: new Date(),
    };

    if (stripeCustomerId) {
      updateData.stripeCustomerId = stripeCustomerId;
    }

    if (stripeSubscriptionId !== undefined) {
      updateData.stripeSubscriptionId = stripeSubscriptionId;
    }

    if (stripeEventTimestamp) {
      updateData.lastBillingEventAt = stripeEventTimestamp;
    }

    // Retry with new version
    const result = await db
      .update(users)
      .set({
        ...updateData,
        billingVersion: drizzleSql`${users.billingVersion} + 1`,
      })
      .where(
        and(
          eq(users.clerkId, clerkUserId),
          eq(users.billingVersion, freshUser.billingVersion)
        )
      )
      .returning({ id: users.id, billingVersion: users.billingVersion });

    if (result.length === 0) {
      // Still failing - retry with backoff up to MAX_RETRIES
      if (retryCount < MAX_RETRIES) {
        return retryUpdateWithFreshData(options, retryCount + 1);
      }

      // Max retries exceeded - log and fail
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

    // Log to audit table
    try {
      await db.insert(billingAuditLog).values({
        userId: freshUser.id,
        eventType,
        previousState: {
          isPro: freshUser.isPro,
          plan: freshUser.plan,
          stripeCustomerId: freshUser.stripeCustomerId,
          stripeSubscriptionId: freshUser.stripeSubscriptionId,
        },
        newState: {
          isPro,
          plan: effectivePlan,
          stripeCustomerId: stripeCustomerId ?? freshUser.stripeCustomerId,
          stripeSubscriptionId:
            stripeSubscriptionId !== undefined
              ? stripeSubscriptionId
              : freshUser.stripeSubscriptionId,
        },
        stripeEventId,
        source,
        metadata: {
          ...metadata,
          clerkUserId,
          billingVersion: result[0].billingVersion,
          retried: true,
          retryCount: retryCount + 1,
        },
      });
    } catch (auditError) {
      await captureWarning(
        'Failed to write billing audit log on retry',
        auditError,
        {
          userId: freshUser.id,
          eventType,
          stripeEventId,
        }
      );
    }

    return { success: true };
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
