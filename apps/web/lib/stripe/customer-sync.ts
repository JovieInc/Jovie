/**
 * Customer Sync Functionality
 * Ensures Stripe customers exist for authenticated users and keeps data synchronized
 *
 * @deprecated This file is maintained for backwards compatibility.
 * Import from '@/lib/stripe/customer-sync/index' for new code.
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

// Re-export everything from the modular structure for backwards compatibility
export {
  // Types and constants
  BILLING_FIELDS_CUSTOMER,
  BILLING_FIELDS_FULL,
  BILLING_FIELDS_STATUS,
  type BillingAuditEventType,
  type BillingFieldsResult,
  // Customer operations
  ensureStripeCustomer,
  type FetchUserBillingDataOptions,
  type FetchUserBillingDataResult,
  type FetchUserBillingDataWithAuthOptions,
  type FetchUserBillingDataWithAuthResult,
  // Query functions
  fetchUserBillingData,
  fetchUserBillingDataWithAuth,
  // Billing info functions
  getBillingAuditLog,
  getUserBillingInfo,
  getUserBillingInfoByClerkId,
  LEGACY_FIELDS,
  type UpdateBillingStatusOptions,
  type UpdateBillingStatusResult,
  type UserBillingFieldKey,
  type UserBillingFields,
  type UserBillingFieldsSelection,
  // Update operations
  updateUserBillingStatus,
  userHasProFeatures,
} from './customer-sync/index';
