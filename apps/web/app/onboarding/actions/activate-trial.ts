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

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { logger } from '@/lib/utils/logger';

const TRIAL_DURATION_DAYS = 14;

/**
 * Activate a 14-day Pro trial for a user.
 * Only activates if the user is currently on the free plan with no prior trial.
 *
 * @param appUserId - The authenticated app `users.id`
 * @returns true if trial was activated, false if skipped (already on trial/paid/had trial before)
 */
export async function activateTrial(appUserId: string): Promise<boolean> {
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
      .where(
        and(
          eq(users.id, appUserId),
          eq(users.plan, 'free'),
          isNull(users.trialStartedAt),
          isNull(users.trialEndsAt)
        )
      )
      .returning({ id: users.id, plan: users.plan });

    if (result.length === 0) {
      // Distinguish "user missing" (data-integrity warning) from the normal
      // skip path (paid plan or prior trial — e.g. re-running onboarding).
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, appUserId))
        .limit(1);

      if (!existing) {
        logger.warn('Trial activation: user not found', { appUserId });
      } else {
        logger.info('Trial activation skipped: not eligible', { appUserId });
      }
      return false;
    }

    logger.info('Trial activated', {
      appUserId,
      trialEndsAt: trialEndsAt.toISOString(),
    });

    return true;
  } catch (error) {
    logger.error('Trial activation failed', { appUserId, error });
    return false;
  }
}
