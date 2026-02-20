import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  checkBoolean,
  getEntitlements,
  type PlanEntitlements,
  type PlanId,
} from './registry';

/**
 * Look up a creator's plan and entitlements by their profile ID.
 *
 * Used by server-side code that operates outside an authenticated session
 * (e.g. public smartlink pages, notification crons) where we have a
 * creatorProfileId but no session user.
 */
export async function getCreatorEntitlements(
  creatorProfileId: string
): Promise<{ plan: PlanId; entitlements: PlanEntitlements }> {
  const [result] = await db
    .select({ plan: users.plan })
    .from(creatorProfiles)
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  const plan = (result?.plan as PlanId) ?? 'free';
  return { plan, entitlements: getEntitlements(plan) };
}

/**
 * Check whether a creator can send notifications based on their plan.
 * Convenience wrapper for the common notification-gating use case.
 */
export async function canCreatorSendNotifications(
  creatorProfileId: string
): Promise<boolean> {
  const { plan } = await getCreatorEntitlements(creatorProfileId);
  return checkBoolean(plan, 'canSendNotifications');
}
