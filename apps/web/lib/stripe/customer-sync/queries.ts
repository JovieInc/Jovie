/**
 * Customer Sync Query Functions
 *
 * Core query functions for fetching user billing data with flexible field selection.
 */

import 'server-only';
import { eq } from 'drizzle-orm';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { captureWarning } from '@/lib/error-tracking';
import {
  BILLING_FIELDS_FULL,
  type BillingFieldsResult,
  buildSelectObject,
  type FetchUserBillingDataOptions,
  type FetchUserBillingDataResult,
  type FetchUserBillingDataWithAuthOptions,
  type FetchUserBillingDataWithAuthResult,
  LEGACY_FIELDS,
  type UserBillingFieldKey,
} from './types';

/**
 * Checks if database error is due to missing column during migration
 */
function isMissingColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof (error as { code?: string })?.code === 'string'
      ? (error as { code?: string }).code
      : undefined;

  return (
    (code === '42703' &&
      (message.includes('is_admin') ||
        message.includes('billing_version') ||
        message.includes('last_billing_event_at'))) ||
    message.includes('users.is_admin') ||
    message.includes('users.billing_version')
  );
}

/**
 * Merges legacy data with default values for missing new fields
 */
function mergeWithDefaults<T extends readonly UserBillingFieldKey[]>(
  legacyData: Record<string, unknown>,
  requestedFields: T
): Record<string, unknown> {
  const merged = { ...legacyData };

  // Add default values for new fields that were requested but unavailable
  if (requestedFields.includes('isAdmin') && !('isAdmin' in merged)) {
    merged.isAdmin = false;
  }
  if (
    requestedFields.includes('billingVersion') &&
    !('billingVersion' in merged)
  ) {
    merged.billingVersion = 1;
  }
  if (
    requestedFields.includes('lastBillingEventAt') &&
    !('lastBillingEventAt' in merged)
  ) {
    merged.lastBillingEventAt = null;
  }

  return merged;
}

function isNonRetryableBillingError(error?: string): boolean {
  return error === 'User not found' || error === 'User not authenticated';
}

/**
 * Attempts to fetch user data with legacy field fallback.
 *
 * @param clerkUserId - For webhook paths: a real Clerk user id (looked up
 *   via `users.clerk_id`). For the auth-aware path: this is unused; see
 *   `fetchUserBillingDataByAppId`.
 */
async function fetchUserDataWithFallback<
  T extends readonly UserBillingFieldKey[],
>(
  clerkUserId: string,
  fields: T,
  // Use ReturnType of buildSelectObject for Drizzle-compatible typing
  selectObj: ReturnType<typeof buildSelectObject<T>>
): Promise<Record<string, unknown> | undefined> {
  try {
    const [result] = await db
      .select(selectObj)
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    return result as Record<string, unknown> | undefined;
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    // Determine which legacy fields to fetch (intersection of requested and available)
    const legacyFieldsToFetch = fields.filter(f => LEGACY_FIELDS.includes(f));

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

    if (!legacyResult) {
      return undefined;
    }

    return mergeWithDefaults(legacyResult as Record<string, unknown>, fields);
  }
}

/**
 * Auth-aware variant of {@link fetchUserDataWithFallback} that looks the
 * user up by app `users.id` (the value returned by `getCachedAuth().userId`
 * post-cutover). Webhook paths still use the clerk_id-keyed helper above
 * because they receive a real Clerk user id from Stripe metadata.
 */
async function fetchUserDataByAppIdWithFallback<
  T extends readonly UserBillingFieldKey[],
>(
  appUserId: string,
  fields: T,
  selectObj: ReturnType<typeof buildSelectObject<T>>
): Promise<Record<string, unknown> | undefined> {
  try {
    const [result] = await db
      .select(selectObj)
      .from(users)
      .where(eq(users.id, appUserId))
      .limit(1);

    return result as Record<string, unknown> | undefined;
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    const legacyFieldsToFetch = fields.filter(f => LEGACY_FIELDS.includes(f));

    if (legacyFieldsToFetch.length === 0) {
      throw error;
    }

    const legacySelectObj = buildSelectObject(
      legacyFieldsToFetch as unknown as T
    );

    const [legacyResult] = await db
      .select(legacySelectObj)
      .from(users)
      .where(eq(users.id, appUserId))
      .limit(1);

    if (!legacyResult) {
      return undefined;
    }

    return mergeWithDefaults(legacyResult as Record<string, unknown>, fields);
  }
}

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
    const selectObj = buildSelectObject(fields);
    const userData = await fetchUserDataWithFallback(
      clerkUserId,
      fields,
      selectObj
    );

    if (!userData) {
      return { success: false, error: 'User not found' };
    }

    return {
      success: true,
      data: userData as BillingFieldsResult<T>,
    };
  } catch (error) {
    await captureWarning('Billing data fetch failed (transient)', error, {
      clerkUserId,
      fields: fields.join(','),
      function: 'fetchUserBillingData',
    });
    return { success: false, error: 'Failed to retrieve billing data' };
  }
}

/**
 * Same contract as {@link fetchUserBillingData} but keyed on the app
 * `users.id` UUID (the value returned by `getCachedAuth().userId`
 * post-cutover) instead of `users.clerk_id`. Used by the auth-aware
 * wrapper; webhook paths still use the clerk_id-keyed helper.
 */
export async function fetchUserBillingDataByAppId<
  T extends readonly UserBillingFieldKey[] = typeof BILLING_FIELDS_FULL,
>(options: {
  appUserId: string;
  fields?: T;
}): Promise<FetchUserBillingDataResult<T>> {
  const { appUserId, fields = BILLING_FIELDS_FULL as unknown as T } = options;

  try {
    const selectObj = buildSelectObject(fields);
    const userData = await fetchUserDataByAppIdWithFallback(
      appUserId,
      fields,
      selectObj
    );

    if (!userData) {
      return { success: false, error: 'User not found' };
    }

    return {
      success: true,
      data: userData as BillingFieldsResult<T>,
    };
  } catch (error) {
    await captureWarning('Billing data fetch failed (transient)', error, {
      appUserId,
      fields: fields.join(','),
      function: 'fetchUserBillingDataByAppId',
    });
    return { success: false, error: 'Failed to retrieve billing data' };
  }
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
    const { userId } = await getCachedAuth();
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    // Post-cutover: getCachedAuth().userId is the app `users.id` UUID.
    // Look up via the app-id-keyed helper so the auth-aware path doesn't
    // depend on `clerk_id` (nullable post migration 0073). Webhook paths
    // keep using the clerk_id-keyed `fetchUserBillingData`.
    const sessionAwareResult = await fetchUserBillingDataByAppId({
      appUserId: userId,
      fields,
    });

    // If billing query fails unexpectedly, retry once as a best-effort guard
    // against transient auth/session setup issues before surfacing an error.
    if (sessionAwareResult.success) {
      return sessionAwareResult;
    }

    // Do not retry deterministic errors that are expected and non-transient.
    // For example, newly authenticated users can exist in auth before their
    // local billing row is created. Callers normalize this case to free plan.
    if (isNonRetryableBillingError(sessionAwareResult.error)) {
      return sessionAwareResult;
    }

    const retryResult = await fetchUserBillingDataByAppId({
      appUserId: userId,
      fields,
    });

    if (!retryResult.success) {
      await captureWarning('Billing data auth query failed after retry', null, {
        appUserId: userId,
        fields: fields.join(','),
        function: 'fetchUserBillingDataWithAuth',
        initialError: sessionAwareResult.error,
        retryError: retryResult.error,
      });
    }

    return retryResult;
  } catch (error) {
    await captureWarning(
      'Billing data fetch with auth failed (transient)',
      error,
      {
        fields: fields.join(','),
        function: 'fetchUserBillingDataWithAuth',
      }
    );
    return { success: false, error: 'Failed to retrieve billing data' };
  }
}
