/**
 * Customer Sync - Billing Info Functions
 *
 * Functions for retrieving user billing information.
 */

import 'server-only';
import { fetchUserBillingData, fetchUserBillingDataWithAuth } from './queries';
import { BILLING_FIELDS_FULL } from './types';

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
    plan: string;
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
  // - Ensure plan is never null (use 'free')
  // - Ensure billingVersion is never null (use 1)
  const data = result.data;
  return {
    success: true,
    data: {
      userId: data.id,
      email: data.email || '',
      isAdmin: data.isAdmin ?? false,
      isPro: data.isPro || false,
      plan: data.plan || 'free',
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      billingVersion: data.billingVersion ?? 1,
      lastBillingEventAt: data.lastBillingEventAt ?? null,
    },
  };
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
