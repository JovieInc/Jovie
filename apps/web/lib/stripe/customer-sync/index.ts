/**
 * Customer Sync Module
 *
 * Ensures Stripe customers exist for authenticated users and keeps data synchronized.
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

// Audit log
export { getBillingAuditLog } from './audit-log';
// Billing info functions
export {
  getUserBillingInfo,
  getUserBillingInfoByClerkId,
  userHasProFeatures,
} from './billing-info';

// Customer operations
export { ensureStripeCustomer } from './customer';
// Query functions
export {
  fetchUserBillingData,
  fetchUserBillingDataWithAuth,
} from './queries';
// Types and constants
export {
  BILLING_FIELDS_CUSTOMER,
  BILLING_FIELDS_FULL,
  BILLING_FIELDS_STATUS,
  type BillingAuditEventType,
  type BillingFieldsResult,
  type FetchUserBillingDataOptions,
  type FetchUserBillingDataResult,
  type FetchUserBillingDataWithAuthOptions,
  type FetchUserBillingDataWithAuthResult,
  LEGACY_FIELDS,
  type UpdateBillingStatusOptions,
  type UpdateBillingStatusResult,
  type UserBillingFieldKey,
  type UserBillingFields,
  type UserBillingFieldsSelection,
} from './types';
// Update operations
export { updateUserBillingStatus } from './update-status';
