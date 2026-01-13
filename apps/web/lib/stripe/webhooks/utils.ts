/**
 * Stripe Webhook Utility Functions
 *
 * Shared utility functions for Stripe webhook event processing.
 * These functions are used by multiple webhook handlers for common operations
 * like extracting IDs, converting timestamps, and managing cache.
 */

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type Stripe from 'stripe';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { captureWarning } from '@/lib/error-tracking';

/**
 * Safely extract the Stripe object ID from a webhook event.
 *
 * Stripe webhook events always have a data.object with an 'id' field.
 * This function safely extracts it with proper type checking.
 *
 * @param event - The Stripe webhook event
 * @returns The object ID if present, null otherwise
 *
 * @example
 * ```ts
 * const event: Stripe.Event = { ... };
 * const objectId = getStripeObjectId(event);
 * // objectId might be 'sub_123abc' for subscription events
 * ```
 */
export function getStripeObjectId(event: Stripe.Event): string | null {
  // Stripe webhook events always have data.object with an 'id' field
  // Cast to unknown first to satisfy TypeScript
  const object = event.data?.object as unknown as
    | { id?: string }
    | null
    | undefined;

  if (object && typeof object.id === 'string' && object.id.length > 0) {
    return object.id;
  }

  return null;
}

/**
 * Convert a Stripe Unix timestamp to a JavaScript Date object.
 *
 * Stripe uses Unix timestamps (seconds since epoch) in their events.
 * JavaScript Date expects milliseconds, so we multiply by 1000.
 *
 * @param timestamp - Unix timestamp from Stripe (seconds since epoch)
 * @returns JavaScript Date object
 *
 * @example
 * ```ts
 * const stripeTimestamp = 1640000000; // 2021-12-20T06:13:20.000Z
 * const date = stripeTimestampToDate(stripeTimestamp);
 * // date.toISOString() === '2021-12-20T06:13:20.000Z'
 * ```
 */
export function stripeTimestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Safely extract customer ID from Stripe objects.
 *
 * Stripe customer fields can be:
 * - A string ID (e.g., 'cus_123abc')
 * - An expanded Customer object with an 'id' field
 * - A DeletedCustomer object with an 'id' field
 * - null
 *
 * This function handles all cases safely.
 *
 * @param customer - Customer field from a Stripe object (string, object, or null)
 * @returns The customer ID string if extractable, null otherwise
 *
 * @example
 * ```ts
 * // String case
 * getCustomerId('cus_123abc'); // 'cus_123abc'
 *
 * // Expanded object case
 * getCustomerId({ id: 'cus_123abc', email: 'test@example.com' }); // 'cus_123abc'
 *
 * // Null case
 * getCustomerId(null); // null
 * ```
 */
export function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  if ('id' in customer && typeof customer.id === 'string') return customer.id;
  return null;
}

/**
 * Fallback: Look up Clerk user ID by Stripe customer ID.
 *
 * Used when subscription/session metadata is missing the clerk_user_id.
 * This can happen with:
 * - Old subscriptions created before metadata was added
 * - Metadata accidentally removed
 * - Subscriptions created through the Stripe dashboard
 *
 * Security Note: This function logs warnings but does NOT log the Stripe
 * customer ID as it's considered PII.
 *
 * @param stripeCustomerId - The Stripe customer ID to look up
 * @returns The Clerk user ID if found, null otherwise
 *
 * @example
 * ```ts
 * const userId = await getUserIdFromStripeCustomer('cus_123abc');
 * if (userId) {
 *   // Process webhook for this user
 * }
 * ```
 */
export async function getUserIdFromStripeCustomer(
  stripeCustomerId: string
): Promise<string | null> {
  try {
    const [user] = await db
      .select({ clerkId: users.clerkId })
      .from(users)
      .where(eq(users.stripeCustomerId, stripeCustomerId))
      .limit(1);

    return user?.clerkId || null;
  } catch (error) {
    await captureWarning(
      'Failed to lookup user by Stripe customer ID in fallback',
      error,
      {
        function: 'getUserIdFromStripeCustomer',
        route: '/api/stripe/webhooks',
      }
    );
    return null;
  }
}

/**
 * Check if a Stripe subscription is currently active.
 *
 * A subscription is considered active if its status is either:
 * - 'active' - Subscription is active and paid
 * - 'trialing' - Subscription is in trial period (free access)
 *
 * Used for determining user access and billing states.
 *
 * @param status - The Stripe subscription status
 * @returns true if subscription is active or trialing, false otherwise
 *
 * @example
 * ```ts
 * const subscription: Stripe.Subscription = { status: 'active', ... };
 * if (isActiveSubscription(subscription.status)) {
 *   // Grant user access
 * }
 * ```
 */
export function isActiveSubscription(
  status: Stripe.Subscription.Status
): boolean {
  return status === 'active' || status === 'trialing';
}

/**
 * Invalidate client-side billing cache by triggering Next.js revalidation.
 *
 * This revalidates the paths that display billing information, causing
 * clients to fetch fresh data on their next request. Called after any
 * billing status change to ensure users see accurate subscription state.
 *
 * Revalidated paths:
 * - /app/dashboard - Main dashboard with billing status
 * - /billing - Billing management page
 * - /app/settings - User settings with plan info
 *
 * @returns Promise that resolves when cache invalidation is complete
 *
 * @example
 * ```ts
 * // After updating subscription status
 * await updateUserBillingStatus({ ... });
 * await invalidateBillingCache();
 * ```
 */
export async function invalidateBillingCache(): Promise<void> {
  // Revalidate the dashboard and any pages that display billing info
  revalidatePath('/app/dashboard');
  revalidatePath('/billing');
  revalidatePath('/app/settings');
}
