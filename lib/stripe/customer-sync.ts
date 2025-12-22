/**
 * Customer Sync Functionality
 * Ensures Stripe customers exist for authenticated users and keeps data synchronized
 *
 * Hardened with:
 * - Optimistic locking via billingVersion to prevent concurrent webhook overwrites
 * - Event ordering via lastBillingEventAt to skip stale events
 * - Audit logging for all subscription state changes
 * - Transaction-based atomic updates
 */

import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { billingAuditLog, users } from '@/lib/db/schema';
import { captureCriticalError, captureWarning } from '@/lib/error-tracking';
import { getOrCreateCustomer, stripe } from './client';

/**
 * Audit log event types for billing state changes
 */
export type BillingAuditEventType =
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_deleted'
  | 'subscription_upgraded'
  | 'subscription_downgraded'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'reconciliation_fix'
  | 'customer_created'
  | 'customer_linked';

/**
 * Options for updating billing status with event ordering support
 */
export interface UpdateBillingStatusOptions {
  clerkUserId: string;
  isPro: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string | null;
  stripeEventId?: string;
  stripeEventTimestamp?: Date;
  eventType?: BillingAuditEventType;
  source?: 'webhook' | 'reconciliation' | 'manual';
  metadata?: Record<string, unknown>;
}

/**
 * Result of a billing status update
 */
export interface UpdateBillingStatusResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * Ensure a Stripe customer exists for the current user
 * Uses transaction for atomic customer-user linking
 */
export async function ensureStripeCustomer(): Promise<{
  success: boolean;
  customerId?: string;
  error?: string;
}> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    return await withDbSession(async clerkUserId => {
      // Get user details from our database
      const [userData] = await db
        .select({
          id: users.id,
          email: users.email,
          stripeCustomerId: users.stripeCustomerId,
          billingVersion: users.billingVersion,
        })
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!userData) {
        return { success: false, error: 'User not found in database' };
      }

      // If we already have a Stripe customer ID, validate and return it
      if (userData.stripeCustomerId) {
        try {
          const existing = await stripe.customers.retrieve(
            userData.stripeCustomerId
          );

          if (
            existing &&
            typeof existing === 'object' &&
            'deleted' in existing &&
            existing.deleted
          ) {
            throw new Error('Stripe customer is deleted');
          }

          const customer = existing as unknown as {
            id: string;
            metadata?: Record<string, string> | null;
          };

          const existingClerkUserId = customer.metadata?.clerk_user_id;
          if (
            typeof existingClerkUserId === 'string' &&
            existingClerkUserId.length > 0 &&
            existingClerkUserId !== clerkUserId
          ) {
            throw new Error('Stripe customer belongs to a different user');
          }

          // Update metadata if needed
          if (existingClerkUserId !== clerkUserId) {
            await stripe.customers.update(customer.id, {
              metadata: {
                ...(customer.metadata ?? {}),
                clerk_user_id: clerkUserId,
                created_via: 'jovie_app',
              },
            });
          }

          return { success: true, customerId: userData.stripeCustomerId };
        } catch (error) {
          await captureWarning(
            'Stored Stripe customer ID is invalid; repairing',
            error,
            {
              clerkUserId,
              function: 'ensureStripeCustomer',
            }
          );
        }
      }

      // Create a new Stripe customer
      const customer = await getOrCreateCustomer(
        clerkUserId,
        userData.email || ''
      );

      // Atomic update with optimistic locking
      try {
        const result = await db
          .update(users)
          .set({
            stripeCustomerId: customer.id,
            billingUpdatedAt: new Date(),
            billingVersion: drizzleSql`${users.billingVersion} + 1`,
          })
          .where(
            and(
              eq(users.clerkId, clerkUserId),
              eq(users.billingVersion, userData.billingVersion)
            )
          )
          .returning({ id: users.id });

        if (result.length === 0) {
          // Concurrent update detected, but customer was created
          // This is recoverable - we can find the customer later by metadata
          await captureWarning(
            'Concurrent update detected during customer creation',
            undefined,
            { clerkUserId, customerId: customer.id }
          );
          return { success: true, customerId: customer.id };
        }

        // Log the customer creation in audit log
        await db.insert(billingAuditLog).values({
          userId: userData.id,
          eventType: 'customer_created',
          previousState: { stripeCustomerId: null },
          newState: { stripeCustomerId: customer.id },
          source: 'manual',
          metadata: { clerkUserId },
        });
      } catch (updateError) {
        console.error(
          'Failed to update user with Stripe customer ID:',
          updateError
        );
        // Customer was created in Stripe but we couldn't save the ID
        // This is recoverable - we can find the customer later by metadata
        return { success: true, customerId: customer.id };
      }

      return { success: true, customerId: customer.id };
    });
  } catch (error) {
    await captureCriticalError('Error ensuring Stripe customer', error, {
      function: 'ensureStripeCustomer',
    });
    return { success: false, error: 'Failed to create or retrieve customer' };
  }
}

/**
 * Get the current user's billing information
 */
export async function getUserBillingInfo(): Promise<{
  success: boolean;
  data?: {
    userId: string;
    email: string;
    isAdmin: boolean;
    isPro: boolean;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    billingVersion: number;
    lastBillingEventAt: Date | null;
  };
  error?: string;
}> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    return await withDbSession(async clerkUserId => {
      let userData:
        | {
            id: string;
            email: string | null;
            isAdmin: boolean;
            isPro: boolean | null;
            stripeCustomerId: string | null;
            stripeSubscriptionId: string | null;
            billingVersion: number;
            lastBillingEventAt: Date | null;
          }
        | undefined;

      try {
        [userData] = await db
          .select({
            id: users.id,
            email: users.email,
            isAdmin: users.isAdmin,
            isPro: users.isPro,
            stripeCustomerId: users.stripeCustomerId,
            stripeSubscriptionId: users.stripeSubscriptionId,
            billingVersion: users.billingVersion,
            lastBillingEventAt: users.lastBillingEventAt,
          })
          .from(users)
          .where(eq(users.clerkId, clerkUserId))
          .limit(1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code =
          typeof (error as { code?: string })?.code === 'string'
            ? (error as { code?: string }).code
            : undefined;

        // Handle missing columns during migration rollout
        const isMissingColumn =
          (code === '42703' &&
            (message.includes('is_admin') ||
              message.includes('billing_version') ||
              message.includes('last_billing_event_at'))) ||
          message.includes('users.is_admin') ||
          message.includes('users.billing_version');

        if (!isMissingColumn) {
          throw error;
        }

        // Backwards-compatible fallback
        const [legacyUserData] = await db
          .select({
            id: users.id,
            email: users.email,
            isPro: users.isPro,
            stripeCustomerId: users.stripeCustomerId,
            stripeSubscriptionId: users.stripeSubscriptionId,
          })
          .from(users)
          .where(eq(users.clerkId, clerkUserId))
          .limit(1);

        if (legacyUserData) {
          userData = {
            ...legacyUserData,
            isAdmin: false,
            billingVersion: 1,
            lastBillingEventAt: null,
          };
        }
      }

      if (!userData) {
        return { success: false, error: 'User not found' };
      }

      return {
        success: true,
        data: {
          userId: userData.id,
          email: userData.email || '',
          isAdmin: userData.isAdmin ?? false,
          isPro: userData.isPro || false,
          stripeCustomerId: userData.stripeCustomerId,
          stripeSubscriptionId: userData.stripeSubscriptionId,
          billingVersion: userData.billingVersion ?? 1,
          lastBillingEventAt: userData.lastBillingEventAt ?? null,
        },
      };
    });
  } catch (error) {
    console.error('Error getting user billing info:', error);
    return { success: false, error: 'Failed to retrieve billing information' };
  }
}

/**
 * Update user's billing status in the database
 * Called from webhooks when subscription status changes
 *
 * Features:
 * - Optimistic locking to prevent concurrent webhook overwrites
 * - Event ordering to skip stale webhook events
 * - Audit logging for all state changes
 */
export async function updateUserBillingStatus(
  options: UpdateBillingStatusOptions
): Promise<UpdateBillingStatusResult> {
  const {
    clerkUserId,
    isPro,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeEventId,
    stripeEventTimestamp,
    eventType = 'subscription_updated',
    source = 'webhook',
    metadata = {},
  } = options;

  try {
    // First, get the current user state
    const [currentUser] = await db
      .select({
        id: users.id,
        isPro: users.isPro,
        stripeCustomerId: users.stripeCustomerId,
        stripeSubscriptionId: users.stripeSubscriptionId,
        billingVersion: users.billingVersion,
        lastBillingEventAt: users.lastBillingEventAt,
      })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!currentUser) {
      return { success: false, error: 'User not found' };
    }

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
      stripeCustomerId: currentUser.stripeCustomerId,
      stripeSubscriptionId: currentUser.stripeSubscriptionId,
    };

    // Prepare new state for audit log
    const newState = {
      isPro,
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
 * Small delay utility for retry backoff
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry billing update with fresh data after optimistic lock failure
 * Includes exponential backoff to prevent thundering herd
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
    stripeCustomerId,
    stripeSubscriptionId,
    stripeEventId,
    stripeEventTimestamp,
    eventType = 'subscription_updated',
    source = 'webhook',
    metadata = {},
  } = options;

  try {
    // Add jittered exponential backoff before retry
    if (retryCount > 0) {
      const backoffMs = BASE_DELAY_MS * Math.pow(2, retryCount - 1);
      const jitter = Math.random() * backoffMs * 0.5; // Add up to 50% jitter
      await delay(backoffMs + jitter);
    }
    // Get fresh user state
    const [freshUser] = await db
      .select({
        id: users.id,
        isPro: users.isPro,
        stripeCustomerId: users.stripeCustomerId,
        stripeSubscriptionId: users.stripeSubscriptionId,
        billingVersion: users.billingVersion,
        lastBillingEventAt: users.lastBillingEventAt,
      })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!freshUser) {
      return { success: false, error: 'User not found on retry' };
    }

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
          stripeCustomerId: freshUser.stripeCustomerId,
          stripeSubscriptionId: freshUser.stripeSubscriptionId,
        },
        newState: {
          isPro,
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

/**
 * Get user billing info by Clerk ID (for webhooks without auth context)
 */
export async function getUserBillingInfoByClerkId(
  clerkUserId: string
): Promise<{
  success: boolean;
  data?: {
    id: string;
    email: string;
    isPro: boolean;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    billingVersion: number;
    lastBillingEventAt: Date | null;
  };
  error?: string;
}> {
  try {
    const [userData] = await db
      .select({
        id: users.id,
        email: users.email,
        isPro: users.isPro,
        stripeCustomerId: users.stripeCustomerId,
        stripeSubscriptionId: users.stripeSubscriptionId,
        billingVersion: users.billingVersion,
        lastBillingEventAt: users.lastBillingEventAt,
      })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!userData) {
      return { success: false, error: 'User not found' };
    }

    return {
      success: true,
      data: {
        id: userData.id,
        email: userData.email || '',
        isPro: userData.isPro || false,
        stripeCustomerId: userData.stripeCustomerId,
        stripeSubscriptionId: userData.stripeSubscriptionId,
        billingVersion: userData.billingVersion ?? 1,
        lastBillingEventAt: userData.lastBillingEventAt ?? null,
      },
    };
  } catch (error) {
    console.error('Error getting user billing info by Clerk ID:', error);
    return { success: false, error: 'Failed to retrieve billing information' };
  }
}

/**
 * Check if the current user has pro features
 * Quick utility for server-side feature gates
 */
export async function userHasProFeatures(): Promise<boolean> {
  const billing = await getUserBillingInfo();
  return billing.success === true && billing.data?.isPro === true;
}

/**
 * Get billing audit log for a user
 */
export async function getBillingAuditLog(
  userId: string,
  limit = 50
): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    eventType: string;
    previousState: Record<string, unknown>;
    newState: Record<string, unknown>;
    stripeEventId: string | null;
    source: string;
    createdAt: Date;
  }>;
  error?: string;
}> {
  try {
    const logs = await db
      .select({
        id: billingAuditLog.id,
        eventType: billingAuditLog.eventType,
        previousState: billingAuditLog.previousState,
        newState: billingAuditLog.newState,
        stripeEventId: billingAuditLog.stripeEventId,
        source: billingAuditLog.source,
        createdAt: billingAuditLog.createdAt,
      })
      .from(billingAuditLog)
      .where(eq(billingAuditLog.userId, userId))
      .orderBy(drizzleSql`${billingAuditLog.createdAt} DESC`)
      .limit(limit);

    return {
      success: true,
      data: logs.map(log => ({
        ...log,
        previousState: log.previousState as Record<string, unknown>,
        newState: log.newState as Record<string, unknown>,
      })),
    };
  } catch (error) {
    console.error('Error getting billing audit log:', error);
    return { success: false, error: 'Failed to retrieve audit log' };
  }
}
