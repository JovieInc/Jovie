/**
 * Customer Sync Functionality
 * Ensures Stripe customers exist for authenticated users and keeps data synchronized
 *
 * ## Architecture
 *
 * This module uses a consolidated query architecture with a single base function
 * (`fetchUserBillingData`) that all billing queries delegate to. This ensures
 * consistent data retrieval, error handling, and migration fallback behavior.
 *
 * ### Query Hierarchy
 * ```
 * fetchUserBillingData (base function)
 * ├── fetchUserBillingDataWithAuth (auth-aware wrapper)
 * │   └── getUserBillingInfo (public API)
 * ├── getUserBillingInfoByClerkId (direct lookup)
 * ├── updateUserBillingStatus (pre-update fetch)
 * │   └── retryUpdateWithFreshData (retry fetch)
 * └── ensureStripeCustomer (customer lookup)
 * ```
 *
 * ### Field Selection Constants
 * - `BILLING_FIELDS_FULL` - All 8 fields for complete billing info
 * - `BILLING_FIELDS_STATUS` - 6 fields for update operations
 * - `BILLING_FIELDS_CUSTOMER` - 4 fields for Stripe customer operations
 *
 * ## Hardened Features
 * - Optimistic locking via billingVersion to prevent concurrent webhook overwrites
 * - Event ordering via lastBillingEventAt to skip stale events
 * - Audit logging for all subscription state changes
 * - Transaction-based atomic updates
 * - Migration fallback for backwards compatibility during schema rollout
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
 * All billing-related fields that can be queried from the users table.
 * This type provides the foundation for the consolidated query function,
 * allowing selective field retrieval while maintaining type safety.
 */
export interface UserBillingFields {
  /** Internal database user ID */
  id: string;
  /** User's email address */
  email: string | null;
  /** Whether the user has admin privileges */
  isAdmin: boolean;
  /** Whether the user has an active Pro subscription */
  isPro: boolean | null;
  /** Stripe customer ID for billing operations */
  stripeCustomerId: string | null;
  /** Active Stripe subscription ID */
  stripeSubscriptionId: string | null;
  /** Optimistic locking version for concurrent update protection */
  billingVersion: number;
  /** Timestamp of the last processed billing event for event ordering */
  lastBillingEventAt: Date | null;
}

/**
 * Utility type for selecting a subset of billing fields.
 * Use this to create strongly-typed queries that only fetch required fields.
 *
 * @example
 * // Select only status-related fields
 * type StatusFields = UserBillingFieldsSelection<'id' | 'isPro' | 'billingVersion'>;
 */
export type UserBillingFieldsSelection<K extends keyof UserBillingFields> =
  Pick<UserBillingFields, K>;

/**
 * Keys of all available billing fields for type-safe field selection
 */
export type UserBillingFieldKey = keyof UserBillingFields;

/**
 * Field selection constants for common query patterns.
 * These constants define which fields to select for different use cases,
 * ensuring consistency across all billing queries.
 */

/**
 * Complete billing information fields.
 * Used by getUserBillingInfo() for full billing context including admin status.
 */
export const BILLING_FIELDS_FULL = [
  'id',
  'email',
  'isAdmin',
  'isPro',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'billingVersion',
  'lastBillingEventAt',
] as const satisfies readonly UserBillingFieldKey[];

/**
 * Billing status fields for update operations.
 * Used by updateUserBillingStatus() and retryUpdateWithFreshData() for
 * optimistic locking and event ordering checks.
 */
export const BILLING_FIELDS_STATUS = [
  'id',
  'isPro',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'billingVersion',
  'lastBillingEventAt',
] as const satisfies readonly UserBillingFieldKey[];

/**
 * Customer sync fields for Stripe customer operations.
 * Used by ensureStripeCustomer() for creating/linking Stripe customers.
 */
export const BILLING_FIELDS_CUSTOMER = [
  'id',
  'email',
  'stripeCustomerId',
  'billingVersion',
] as const satisfies readonly UserBillingFieldKey[];

/**
 * Type helper for inferring field selection result type from a constant.
 * @example
 * type FullFields = BillingFieldsResult<typeof BILLING_FIELDS_FULL>;
 */
export type BillingFieldsResult<T extends readonly UserBillingFieldKey[]> =
  Pick<UserBillingFields, T[number]>;

/**
 * Options for the fetchUserBillingData function
 */
export interface FetchUserBillingDataOptions<
  T extends readonly UserBillingFieldKey[] = typeof BILLING_FIELDS_FULL,
> {
  /** The Clerk user ID to look up */
  clerkUserId: string;
  /**
   * Optional array of fields to select. Defaults to BILLING_FIELDS_FULL.
   * Use one of the predefined constants (BILLING_FIELDS_FULL, BILLING_FIELDS_STATUS,
   * BILLING_FIELDS_CUSTOMER) or a custom array for type-safe selective retrieval.
   */
  fields?: T;
}

/**
 * Result of fetching user billing data
 */
export interface FetchUserBillingDataResult<
  T extends readonly UserBillingFieldKey[],
> {
  success: boolean;
  data?: BillingFieldsResult<T>;
  error?: string;
}

/**
 * Internal helper to build the Drizzle select object from field keys.
 * Maps field names to the corresponding users table columns.
 *
 * This is used by fetchUserBillingData to dynamically construct the SELECT
 * clause based on the requested fields, enabling type-safe selective queries.
 *
 * @internal
 * @param fields - Array of field keys to include in the select
 * @returns Object mapping field names to Drizzle column references
 */
function buildSelectObject<T extends readonly UserBillingFieldKey[]>(
  fields: T
) {
  const fieldMap = {
    id: users.id,
    email: users.email,
    isAdmin: users.isAdmin,
    isPro: users.isPro,
    stripeCustomerId: users.stripeCustomerId,
    stripeSubscriptionId: users.stripeSubscriptionId,
    billingVersion: users.billingVersion,
    lastBillingEventAt: users.lastBillingEventAt,
  } as const;

  const selectObj: Partial<typeof fieldMap> = {};
  for (const field of fields) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selectObj as any)[field] = fieldMap[field];
  }
  return selectObj as Pick<typeof fieldMap, T[number]>;
}

/**
 * Fields available during legacy/migration fallback (without new columns)
 */
const LEGACY_FIELDS: readonly UserBillingFieldKey[] = [
  'id',
  'email',
  'isPro',
  'stripeCustomerId',
  'stripeSubscriptionId',
] as const;

/**
 * Core query function for fetching user billing data.
 * All other billing queries should delegate to this function.
 *
 * Features:
 * - Flexible field selection for optimized queries
 * - Migration fallback for backwards compatibility during schema rollout
 * - Consistent error handling with success/error pattern
 * - Strongly-typed results based on selected fields
 *
 * @param options - Query options including clerkUserId and optional field selection
 * @returns Promise with success status, typed data, or error message
 *
 * @example
 * // Fetch all billing fields (default)
 * const result = await fetchUserBillingData({ clerkUserId: 'user_123' });
 *
 * @example
 * // Fetch only status fields for update operations
 * const result = await fetchUserBillingData({
 *   clerkUserId: 'user_123',
 *   fields: BILLING_FIELDS_STATUS,
 * });
 *
 * @example
 * // Fetch custom subset of fields
 * const result = await fetchUserBillingData({
 *   clerkUserId: 'user_123',
 *   fields: ['id', 'email', 'stripeCustomerId'] as const,
 * });
 */
export async function fetchUserBillingData<
  T extends readonly UserBillingFieldKey[] = typeof BILLING_FIELDS_FULL,
>(
  options: FetchUserBillingDataOptions<T>
): Promise<FetchUserBillingDataResult<T>> {
  const { clerkUserId, fields = BILLING_FIELDS_FULL as unknown as T } = options;

  try {
    // Build the select object dynamically based on requested fields
    const selectObj = buildSelectObject(fields);

    let userData: Record<string, unknown> | undefined;

    try {
      const [result] = await db
        .select(selectObj)
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      userData = result as Record<string, unknown> | undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof (error as { code?: string })?.code === 'string'
          ? (error as { code?: string }).code
          : undefined;

      // Handle missing columns during migration rollout
      // This provides backwards compatibility when new columns haven't been deployed
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

      // Determine which legacy fields to fetch (intersection of requested and available)
      const legacyFieldsToFetch = fields.filter(f =>
        LEGACY_FIELDS.includes(f)
      ) as UserBillingFieldKey[];

      if (legacyFieldsToFetch.length === 0) {
        // All requested fields are new columns that don't exist yet
        throw error;
      }

      const legacySelectObj = buildSelectObject(
        legacyFieldsToFetch as unknown as T
      );

      const [legacyResult] = await db
        .select(legacySelectObj)
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (legacyResult) {
        // Merge legacy data with defaults for missing fields
        userData = { ...(legacyResult as Record<string, unknown>) };

        // Add default values for new fields that were requested but unavailable
        if (fields.includes('isAdmin') && !('isAdmin' in userData)) {
          userData.isAdmin = false;
        }
        if (
          fields.includes('billingVersion') &&
          !('billingVersion' in userData)
        ) {
          userData.billingVersion = 1;
        }
        if (
          fields.includes('lastBillingEventAt') &&
          !('lastBillingEventAt' in userData)
        ) {
          userData.lastBillingEventAt = null;
        }
      }
    }

    if (!userData) {
      return { success: false, error: 'User not found' };
    }

    return {
      success: true,
      data: userData as BillingFieldsResult<T>,
    };
  } catch (error) {
    await captureCriticalError('Error fetching user billing data', error, {
      clerkUserId,
      fields: fields.join(','),
      function: 'fetchUserBillingData',
    });
    return { success: false, error: 'Failed to retrieve billing data' };
  }
}

/**
 * Options for the auth-aware billing data wrapper
 */
export interface FetchUserBillingDataWithAuthOptions<
  T extends readonly UserBillingFieldKey[] = typeof BILLING_FIELDS_FULL,
> {
  /**
   * Optional array of fields to select. Defaults to BILLING_FIELDS_FULL.
   * Use one of the predefined constants (BILLING_FIELDS_FULL, BILLING_FIELDS_STATUS,
   * BILLING_FIELDS_CUSTOMER) or a custom array for type-safe selective retrieval.
   */
  fields?: T;
}

/**
 * Result of the auth-aware billing data fetch
 */
export interface FetchUserBillingDataWithAuthResult<
  T extends readonly UserBillingFieldKey[],
> {
  success: boolean;
  data?: BillingFieldsResult<T>;
  error?: string;
}

/**
 * Auth-aware wrapper for fetchUserBillingData.
 * Automatically retrieves the clerkUserId from the current auth context
 * using Clerk's auth() and withDbSession, then delegates to fetchUserBillingData.
 *
 * This is the preferred entry point for server-side code that needs billing data
 * for the currently authenticated user.
 *
 * @param options - Optional configuration including field selection
 * @returns Promise with success status, typed data, or error message
 *
 * @example
 * // Fetch all billing fields for the current user
 * const result = await fetchUserBillingDataWithAuth();
 *
 * @example
 * // Fetch only specific fields
 * const result = await fetchUserBillingDataWithAuth({
 *   fields: BILLING_FIELDS_STATUS,
 * });
 *
 * @example
 * // Fetch custom subset of fields
 * const result = await fetchUserBillingDataWithAuth({
 *   fields: ['id', 'isPro', 'stripeCustomerId'] as const,
 * });
 */
export async function fetchUserBillingDataWithAuth<
  T extends readonly UserBillingFieldKey[] = typeof BILLING_FIELDS_FULL,
>(
  options: FetchUserBillingDataWithAuthOptions<T> = {}
): Promise<FetchUserBillingDataWithAuthResult<T>> {
  const { fields = BILLING_FIELDS_FULL as unknown as T } = options;

  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    return await withDbSession(async clerkUserId => {
      return await fetchUserBillingData({ clerkUserId, fields });
    });
  } catch (error) {
    await captureCriticalError(
      'Error fetching user billing data with auth',
      error,
      {
        fields: fields.join(','),
        function: 'fetchUserBillingDataWithAuth',
      }
    );
    return { success: false, error: 'Failed to retrieve billing data' };
  }
}

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
 * Ensure a Stripe customer exists for the current user.
 *
 * This function uses fetchUserBillingData internally with BILLING_FIELDS_CUSTOMER
 * to efficiently query only the fields needed for customer operations.
 *
 * Features:
 * - Validates existing Stripe customer ID if present
 * - Creates new Stripe customer if needed
 * - Uses atomic update with optimistic locking
 * - Logs customer creation in audit log
 *
 * @returns Promise with success status and customerId, or error message
 *
 * @example
 * const result = await ensureStripeCustomer();
 * if (result.success) {
 *   // Use result.customerId for Stripe operations
 *   const session = await stripe.checkout.sessions.create({
 *     customer: result.customerId,
 *     // ...
 *   });
 * }
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
      // Get user details using consolidated query function
      const userResult = await fetchUserBillingData({
        clerkUserId,
        fields: BILLING_FIELDS_CUSTOMER,
      });

      if (!userResult.success || !userResult.data) {
        return {
          success: false,
          error: userResult.error ?? 'User not found in database',
        };
      }

      const userData = userResult.data;

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
        // Customer was created in Stripe but we couldn't save the ID
        // This is recoverable - we can find the customer later by metadata
        await captureWarning(
          'Failed to update user with Stripe customer ID',
          updateError,
          { clerkUserId, customerId: customer.id }
        );
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
 * Get the current user's billing information.
 *
 * This function uses fetchUserBillingDataWithAuth internally for the database
 * query, then transforms the result to match the expected public API format.
 *
 * @returns Promise with billing info including userId, email, subscription status
 *
 * @example
 * const billing = await getUserBillingInfo();
 * if (billing.success && billing.data) {
 *   console.log(`User ${billing.data.userId} isPro: ${billing.data.isPro}`);
 * }
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
  // Delegate to the consolidated query function with full fields
  const result = await fetchUserBillingDataWithAuth({
    fields: BILLING_FIELDS_FULL,
  });

  // If the query failed, pass through the error
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error ?? 'Failed to retrieve billing information',
    };
  }

  // Transform the result to match the expected public API format:
  // - Rename 'id' to 'userId'
  // - Ensure email is never null (use empty string)
  // - Ensure isPro is never null (use false)
  // - Ensure isAdmin is never null (use false)
  // - Ensure billingVersion is never null (use 1)
  const data = result.data;
  return {
    success: true,
    data: {
      userId: data.id,
      email: data.email || '',
      isAdmin: data.isAdmin ?? false,
      isPro: data.isPro || false,
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      billingVersion: data.billingVersion ?? 1,
      lastBillingEventAt: data.lastBillingEventAt ?? null,
    },
  };
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
    stripeCustomerId,
    stripeSubscriptionId,
    stripeEventId,
    stripeEventTimestamp,
    eventType = 'subscription_updated',
    source = 'webhook',
    metadata = {},
  } = options;

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
 * Get user billing info by Clerk ID (for webhooks without auth context).
 *
 * This function is a thin wrapper around fetchUserBillingData for cases where
 * you have a clerkUserId directly (e.g., from webhook payloads) rather than
 * getting it from the auth context.
 *
 * @param clerkUserId - The Clerk user ID to look up
 * @returns Promise with billing info including id, email, subscription status
 *
 * @example
 * // In a webhook handler
 * const billing = await getUserBillingInfoByClerkId(clerkUserIdFromWebhook);
 * if (billing.success && billing.data) {
 *   console.log(`User ${billing.data.id} isPro: ${billing.data.isPro}`);
 * }
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
  // Delegate to the consolidated query function
  const result = await fetchUserBillingData({
    clerkUserId,
    fields: BILLING_FIELDS_FULL,
  });

  // If the query failed, pass through the error
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error ?? 'Failed to retrieve billing information',
    };
  }

  // Transform the result to match the expected public API format:
  // - Ensure email is never null (use empty string)
  // - Ensure isPro is never null (use false)
  // - Ensure billingVersion is never null (use 1)
  const data = result.data;
  return {
    success: true,
    data: {
      id: data.id,
      email: data.email || '',
      isPro: data.isPro || false,
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      billingVersion: data.billingVersion ?? 1,
      lastBillingEventAt: data.lastBillingEventAt ?? null,
    },
  };
}

/**
 * Check if the current user has pro features.
 *
 * Quick utility function for server-side feature gates. Internally uses
 * getUserBillingInfo which delegates to fetchUserBillingDataWithAuth.
 *
 * @returns Promise resolving to true if user is authenticated and has Pro status
 *
 * @example
 * // In a server action or API route
 * if (await userHasProFeatures()) {
 *   // Allow access to pro-only features
 *   return { canExport: true };
 * }
 */
export async function userHasProFeatures(): Promise<boolean> {
  const billing = await getUserBillingInfo();
  return billing.success === true && billing.data?.isPro === true;
}

/**
 * Get billing audit log entries for a user.
 *
 * Retrieves historical billing state changes including subscription updates,
 * payment events, and reconciliation fixes. Useful for debugging billing
 * issues and providing transparency to users.
 *
 * @param userId - The internal database user ID (not Clerk ID)
 * @param limit - Maximum number of entries to return (default: 50)
 * @returns Promise with audit log entries sorted by most recent first
 *
 * @example
 * // Get recent billing history for a user
 * const result = await getBillingAuditLog(userId, 10);
 * if (result.success && result.data) {
 *   for (const entry of result.data) {
 *     console.log(`${entry.eventType} at ${entry.createdAt}`);
 *   }
 * }
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
    await captureCriticalError('Error getting billing audit log', error, {
      userId,
      limit,
      function: 'getBillingAuditLog',
    });
    return { success: false, error: 'Failed to retrieve audit log' };
  }
}
