/**
 * Customer Sync - Stripe Customer Operations
 *
 * Functions for ensuring Stripe customers exist and are properly linked.
 */

import 'server-only';
import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { appUserIdFilter } from '@/lib/auth/app-user-id';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { billingAuditLog } from '@/lib/db/schema/billing';
import { captureCriticalError, captureWarning } from '@/lib/error-tracking';
import { captureRevenueSpineFailure } from '@/lib/observability/revenue-spine';
import { getOrCreateCustomer, stripe } from '../client';
import { fetchUserBillingDataByAppId } from './queries';
import { BILLING_FIELDS_CUSTOMER } from './types';

function isCustomerWithMetadata(
  value: unknown
): value is { id: string; metadata?: Record<string, string> | null } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (!('id' in value) || typeof value.id !== 'string') {
    return false;
  }

  if (!('metadata' in value) || value.metadata == null) {
    return true;
  }

  return typeof value.metadata === 'object';
}

function isStripeResourceMissingError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'resource_missing'
  );
}

async function isMatchingLegacyClerkIdentity(
  stripeIdentity: string,
  appUserId: string
): Promise<boolean> {
  const [user] = await db
    .select({ clerkId: users.clerkId })
    .from(users)
    .where(appUserIdFilter(appUserId))
    .limit(1);

  return user?.clerkId === stripeIdentity;
}

/**
 * Validate and return an existing Stripe customer ID, or null if invalid/missing.
 * Returns null on any validation failure so the caller can proceed to create a new customer.
 */
async function validateExistingStripeCustomer(
  stripeCustomerId: string,
  appUserId: string
): Promise<string | null> {
  let existing: Awaited<ReturnType<typeof stripe.customers.retrieve>>;
  try {
    existing = await stripe.customers.retrieve(stripeCustomerId);
  } catch (error) {
    if (!isStripeResourceMissingError(error)) {
      throw error;
    }

    await captureWarning(
      'Stored Stripe customer ID is invalid; repairing',
      error,
      { appUserId, function: 'ensureStripeCustomer' }
    );
    return null;
  }

  if (
    existing &&
    typeof existing === 'object' &&
    'deleted' in existing &&
    existing.deleted
  ) {
    await captureWarning(
      'Stored Stripe customer ID is invalid; repairing',
      new Error('Stripe customer is deleted'),
      { appUserId, function: 'ensureStripeCustomer' }
    );
    return null;
  }

  if (!isCustomerWithMetadata(existing)) {
    throw new Error('Stripe customer payload is missing id');
  }

  const customer = existing;
  const existingClerkUserId = customer.metadata?.clerk_user_id;
  const hasExistingIdentity =
    typeof existingClerkUserId === 'string' && existingClerkUserId.length > 0;
  const identityMatches =
    existingClerkUserId === appUserId ||
    (hasExistingIdentity &&
      (await isMatchingLegacyClerkIdentity(existingClerkUserId, appUserId)));

  if (hasExistingIdentity && !identityMatches) {
    await captureWarning(
      'Stored Stripe customer ID is invalid; repairing',
      new Error('Stripe customer belongs to a different user'),
      { appUserId, function: 'ensureStripeCustomer' }
    );
    return null;
  }

  if (existingClerkUserId !== appUserId) {
    try {
      await stripe.customers.update(customer.id, {
        metadata: {
          ...customer.metadata,
          clerk_user_id: appUserId,
          created_via: 'jovie_app',
        },
      });
    } catch (error) {
      await captureWarning(
        'Failed to upgrade Stripe customer identity metadata',
        error,
        { appUserId, customerId: customer.id }
      );
    }
  }

  return stripeCustomerId;
}

/**
 * Ensure a Stripe customer exists for the current user.
 *
 * This function uses the authenticated app user UUID with
 * BILLING_FIELDS_CUSTOMER to query only the fields needed for customer
 * operations.
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
  let resolvedAppUserId: string | undefined;
  let candidateCustomerId: string | undefined;
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    return await withDbSession(async appUserId => {
      resolvedAppUserId = appUserId;
      const userResult = await fetchUserBillingDataByAppId({
        appUserId,
        fields: BILLING_FIELDS_CUSTOMER,
      });

      if (!userResult.success || !userResult.data) {
        captureRevenueSpineFailure({
          stage: 'stripe_sync',
          failureCode: 'billing_unavailable',
          severity: 'blocked',
          userId: appUserId,
        });
        return {
          success: false,
          error: userResult.error ?? 'User not found in database',
        };
      }

      const userData = userResult.data;

      // If we already have a Stripe customer ID, validate and return it
      if (userData.stripeCustomerId) {
        const validCustomerId = await validateExistingStripeCustomer(
          userData.stripeCustomerId,
          appUserId
        );
        if (validCustomerId) {
          return { success: true, customerId: validCustomerId };
        }
      }

      // Create a new Stripe customer
      const customer = await getOrCreateCustomer(
        appUserId,
        userData.email || ''
      );

      candidateCustomerId = customer.id;

      // Persist ownership and its audit atomically before allowing checkout.
      const result = await withDbSessionTx(
        async tx => {
          const updated = await tx
            .update(users)
            .set({
              stripeCustomerId: customer.id,
              billingUpdatedAt: new Date(),
              billingVersion: drizzleSql`${users.billingVersion} + 1`,
            })
            .where(
              and(
                appUserIdFilter(appUserId),
                eq(users.billingVersion, userData.billingVersion),
                userData.stripeCustomerId
                  ? eq(users.stripeCustomerId, userData.stripeCustomerId)
                  : isNull(users.stripeCustomerId)
              )
            )
            .returning({ id: users.id });

          if (updated.length > 0) {
            await tx.insert(billingAuditLog).values({
              userId: userData.id,
              eventType: 'customer_created',
              previousState: { stripeCustomerId: userData.stripeCustomerId },
              newState: { stripeCustomerId: customer.id },
              source: 'manual',
              metadata: { appUserId },
            });
          }

          return updated;
        },
        { clerkUserId: appUserId }
      );

      if (result.length === 0) {
        // A concurrent writer may have persisted a different customer. Only
        // the fresh database winner can authorize checkout, never our candidate.
        const winner = await fetchUserBillingDataByAppId({
          appUserId,
          fields: BILLING_FIELDS_CUSTOMER,
        });
        const winnerId = winner.success && winner.data?.stripeCustomerId;
        const validWinnerId = winnerId
          ? await validateExistingStripeCustomer(winnerId, appUserId)
          : null;
        if (!validWinnerId) {
          throw new Error(
            'Concurrent customer update has no valid persisted winner'
          );
        }

        if (validWinnerId !== customer.id) {
          await captureWarning(
            'Stripe customer orphan recovered by persisted winner',
            undefined,
            {
              appUserId,
              customerId: customer.id,
              persistedCustomerId: validWinnerId,
            }
          );
        }
        return { success: true, customerId: validWinnerId };
      }

      return { success: true, customerId: customer.id };
    });
  } catch (error) {
    captureRevenueSpineFailure({
      stage: 'stripe_sync',
      severity: 'blocked',
      userId: resolvedAppUserId,
      error,
    });
    await captureCriticalError('Error ensuring Stripe customer', error, {
      function: 'ensureStripeCustomer',
      diagnostic: 'stripe_customer_ownership_unresolved',
      appUserId: resolvedAppUserId,
      orphanCustomerId: candidateCustomerId,
      recovery: 'retry_with_same_app_user_id',
    });
    return { success: false, error: 'Failed to create or retrieve customer' };
  }
}
