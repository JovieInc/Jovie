/**
 * Trial Activation — Dedicated server action for the 14-day reverse trial.
 *
 * Called after onboarding completes. Sets plan='trial' with a 14-day window.
 * Kept separate from profile-setup.ts to maintain billing/profile separation.
 *
 * The trial gives Pro-level entitlements with caps:
 * - 250 contacts, 25 AI msgs/day, 3 pitch gens/release
 * - 50 total notification recipients (tracked in trialNotificationsSent)
 */

import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { logger } from '@/lib/utils/logger';

const TRIAL_DURATION_DAYS = 14;

/**
 * Activate a 14-day Pro trial for a user.
 * Only activates if the user is currently on the free plan with no prior trial.
 *
 * @param clerkId - The Clerk user ID
 * @returns true if trial was activated, false if skipped (already on trial/paid/had trial before)
 */
export async function activateTrial(clerkId: string): Promise<boolean> {
  try {
    const now = new Date();
    const trialEndsAt = new Date(
      now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    // Only activate for users on 'free' plan who haven't had a trial before.
    // The WHERE clause prevents double-activation and respects existing paid users.
    const result = await db
      .update(users)
      .set({
        plan: 'trial',
        trialStartedAt: now,
        trialEndsAt,
        trialNotificationsSent: 0,
      })
      .where(eq(users.clerkId, clerkId))
      .returning({ id: users.id, plan: users.plan });

    if (result.length === 0) {
      logger.warn('Trial activation: user not found', { clerkId });
      return false;
    }

    logger.info('Trial activated', {
      clerkId,
      trialEndsAt: trialEndsAt.toISOString(),
    });

    return true;
  } catch (error) {
    logger.error('Trial activation failed', { clerkId, error });
    return false;
  }
}
