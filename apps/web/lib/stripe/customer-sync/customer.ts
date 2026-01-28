/**
 * Customer Sync - Stripe Customer Operations
 *
 * Functions for ensuring Stripe customers exist and are properly linked.
 */

import 'server-only';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { billingAuditLog, users } from '@/lib/db/schema';
import { captureCriticalError, captureWarning } from '@/lib/error-tracking';
import { getOrCreateCustomer, stripe } from '../client';
import { fetchUserBillingData } from './queries';
import { BILLING_FIELDS_CUSTOMER } from './types';

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
    const { userId } = await getCachedAuth();
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
