/**
 * Customer Sync Query Functions
 *
 * Core query functions for fetching user billing data with flexible field selection.
 */

import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { captureCriticalError } from '@/lib/error-tracking';
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

/**
 * Attempts to fetch user data with legacy field fallback
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
    await captureCriticalError('Error fetching user billing data', error, {
      clerkUserId,
      fields: fields.join(','),
      function: 'fetchUserBillingData',
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
