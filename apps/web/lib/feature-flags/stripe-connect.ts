import 'server-only';
import { getAppFlagValue } from '@/lib/flags/server';

/**
 * Check if Stripe Connect onboarding is enabled for a given user.
 *
 * Uses the runtime app flag surface, which defaults on for internal v1.
 * The gate key is `stripe-connect-enabled`.
 *
 * @param userId - Clerk user ID (or null for anonymous)
 * @returns true if the feature is enabled
 */
export function isStripeConnectEnabled(
  userId: string | null
): Promise<boolean> {
  return getAppFlagValue('STRIPE_CONNECT_ENABLED', { userId });
}
