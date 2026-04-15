import 'server-only';

import { FEATURE_FLAGS } from './shared';

/**
 * Check if Stripe Connect onboarding is enabled for a given user.
 *
 * Uses the code flag registry.
 *
 * @param userId - Clerk user ID (or null for anonymous)
 * @returns true if the feature is enabled
 */
export function isStripeConnectEnabled(
  _userId: string | null
): Promise<boolean> {
  return Promise.resolve(FEATURE_FLAGS.STRIPE_CONNECT_ENABLED);
}
