/**
 * Customer Sync Functionality
 * Ensures Stripe customers exist for authenticated users and keeps data synchronized
 */

import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getOrCreateCustomer } from './client';

/**
 * Ensure a Stripe customer exists for the current user
 * This should be called on any authenticated server action that needs billing
 */
export async function ensureStripeCustomer(): Promise<{
  success: boolean;
  customerId?: string;
  error?: string;
}> {
  try {
    // Get the current user from Clerk
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    return await withDbSession(async clerkUserId => {
      // Get user details from our database
      const [userData] = await db
        .select({
          id: users.id,
          email: users.email,
          stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!userData) {
        return { success: false, error: 'User not found in database' };
      }

      // If we already have a Stripe customer ID, return it
      if (userData.stripeCustomerId) {
        return { success: true, customerId: userData.stripeCustomerId };
      }

      // Create a new Stripe customer
      const customer = await getOrCreateCustomer(
        clerkUserId,
        userData.email || ''
      );

      // Update our database with the new customer ID
      try {
        await db
          .update(users)
          .set({
            stripeCustomerId: customer.id,
            billingUpdatedAt: new Date(),
          })
          .where(eq(users.clerkId, clerkUserId));
      } catch (updateError) {
        console.error(
          'Failed to update user with Stripe customer ID:',
          updateError
        );
        // Customer was created in Stripe but we couldn't save the ID
        // This is recoverable - we can find the customer later by metadata
        return { success: true, customerId: customer.id };
      }

      return { success: true, customerId: customer.id };
    });
  } catch (error) {
    console.error('Error ensuring Stripe customer:', error);
    return { success: false, error: 'Failed to create or retrieve customer' };
  }
}

/**
 * Get the current user's billing information
 */
export async function getUserBillingInfo(): Promise<{
  success: boolean;
  data?: {
    userId: string;
    email: string;
    isPro: boolean;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  };
  error?: string;
}> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    return await withDbSession(async clerkUserId => {
      const [userData] = await db
        .select({
          id: users.id,
          email: users.email,
          isPro: users.isPro,
          stripeCustomerId: users.stripeCustomerId,
          stripeSubscriptionId: users.stripeSubscriptionId,
        })
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!userData) {
        return { success: false, error: 'User not found' };
      }

      return {
        success: true,
        data: {
          userId: userData.id,
          email: userData.email || '',
          isPro: userData.isPro || false,
          stripeCustomerId: userData.stripeCustomerId,
          stripeSubscriptionId: userData.stripeSubscriptionId,
        },
      };
    });
  } catch (error) {
    console.error('Error getting user billing info:', error);
    return { success: false, error: 'Failed to retrieve billing information' };
  }
}

/**
 * Update user's billing status in the database
 * Called from webhooks when subscription status changes
 */
export async function updateUserBillingStatus({
  clerkUserId,
  isPro,
  stripeCustomerId,
  stripeSubscriptionId,
}: {
  clerkUserId: string;
  isPro: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
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

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.clerkId, clerkUserId));

    return { success: true };
  } catch (error) {
    console.error('Error updating user billing status:', error);
    return { success: false, error: 'Failed to update billing status' };
  }
}

/**
 * Check if the current user has pro features
 * Quick utility for server-side feature gates
 */
export async function userHasProFeatures(): Promise<boolean> {
  const billing = await getUserBillingInfo();
  return billing.success === true && billing.data?.isPro === true;
}
