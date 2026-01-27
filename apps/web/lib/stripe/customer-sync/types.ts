/**
 * Customer Sync Types and Constants
 *
 * Shared types, interfaces, and field selection constants for billing operations.
 */

import { users } from '@/lib/db/schema';

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
  /** The user's current plan: 'free' | 'pro' | 'growth' */
  plan: string | null;
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
 * Type helper for inferring field selection result type from a constant.
 * @example
 * type FullFields = BillingFieldsResult<typeof BILLING_FIELDS_FULL>;
 */
export type BillingFieldsResult<T extends readonly UserBillingFieldKey[]> =
  Pick<UserBillingFields, T[number]>;

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
  'plan',
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
  'plan',
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
 * Fields available during legacy/migration fallback (without new columns)
 */
export const LEGACY_FIELDS: readonly UserBillingFieldKey[] = [
  'id',
  'email',
  'isPro',
  'stripeCustomerId',
  'stripeSubscriptionId',
] as const;

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
 * Options for updating billing status with event ordering support
 */
export interface UpdateBillingStatusOptions {
  clerkUserId: string;
  isPro: boolean;
  plan?: string; // 'free' | 'pro' | 'growth'
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
export function buildSelectObject<T extends readonly UserBillingFieldKey[]>(
  fields: T
) {
  const fieldMap = {
    id: users.id,
    email: users.email,
    isAdmin: users.isAdmin,
    isPro: users.isPro,
    plan: users.plan,
    stripeCustomerId: users.stripeCustomerId,
    stripeSubscriptionId: users.stripeSubscriptionId,
    billingVersion: users.billingVersion,
    lastBillingEventAt: users.lastBillingEventAt,
  } as const;

  const selectObj: Partial<typeof fieldMap> = {};
  for (const field of fields) {
    // Type-safe dynamic property assignment using Record indexing
    (
      selectObj as Record<
        UserBillingFieldKey,
        (typeof fieldMap)[UserBillingFieldKey]
      >
    )[field] = fieldMap[field];
  }
  return selectObj as Pick<typeof fieldMap, T[number]>;
}
