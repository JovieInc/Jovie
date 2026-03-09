import 'server-only';

import { checkGate } from './server';
import { FEATURE_FLAG_KEYS } from './shared';

/**
 * Check if Stripe Connect onboarding is enabled for a given user.
 *
 * Uses Statsig feature gate when configured, otherwise defaults to OFF.
 * The gate key is `stripe-connect-enabled`.
 *
 * @param userId - Clerk user ID (or null for anonymous)
 * @returns true if the feature is enabled
 */
export async function isStripeConnectEnabled(
  userId: string | null
): Promise<boolean> {
  return checkGate(userId, FEATURE_FLAG_KEYS.STRIPE_CONNECT_ENABLED, false);
}
