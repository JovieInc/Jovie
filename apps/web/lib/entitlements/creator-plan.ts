import 'server-only';

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
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
    .select({
      claimedUserId: userProfileClaims.userId,
      legacyUserId: creatorProfiles.userId,
    })
    .from(creatorProfiles)
    .leftJoin(
      userProfileClaims,
      eq(userProfileClaims.creatorProfileId, creatorProfiles.id)
    )
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  const ownerUserId = result?.claimedUserId ?? result?.legacyUserId ?? null;
  if (!ownerUserId) {
    return { plan: 'free', entitlements: getEntitlements('free') };
  }

  const [userRecord] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, ownerUserId))
    .limit(1);

  const plan = (userRecord?.plan as PlanId | undefined) ?? 'free';
  return { plan, entitlements: getEntitlements(plan) };
}

/**
 * Look up plans and entitlements for multiple creators in a single query.
 *
 * Used by cron jobs that need to check entitlements for a batch of creators
 * without issuing N individual queries.
 */
export async function getBatchCreatorEntitlements(
  creatorProfileIds: string[]
): Promise<Map<string, { plan: PlanId; entitlements: PlanEntitlements }>> {
  if (creatorProfileIds.length === 0) return new Map();

  const ownershipRows = await db
    .select({
      creatorProfileId: creatorProfiles.id,
      claimedUserId: userProfileClaims.userId,
      legacyUserId: creatorProfiles.userId,
    })
    .from(creatorProfiles)
    .leftJoin(
      userProfileClaims,
      eq(userProfileClaims.creatorProfileId, creatorProfiles.id)
    )
    .where(inArray(creatorProfiles.id, creatorProfileIds));

  const ownerIds = Array.from(
    new Set(
      ownershipRows
        .map(row => row.claimedUserId ?? row.legacyUserId)
        .filter((userId): userId is string => Boolean(userId))
    )
  );

  const userPlans =
    ownerIds.length === 0
      ? []
      : await db
          .select({ id: users.id, plan: users.plan })
          .from(users)
          .where(inArray(users.id, ownerIds));

  const planByUserId = new Map(
    userPlans.map(row => [row.id, (row.plan as PlanId | undefined) ?? 'free'])
  );

  const map = new Map<
    string,
    { plan: PlanId; entitlements: PlanEntitlements }
  >();
  for (const row of ownershipRows) {
    const ownerUserId = row.claimedUserId ?? row.legacyUserId;
    const plan = ownerUserId
      ? (planByUserId.get(ownerUserId) ?? 'free')
      : 'free';
    map.set(row.creatorProfileId, {
      plan,
      entitlements: getEntitlements(plan),
    });
  }

  // Creators not found in the join default to 'free'
  for (const id of creatorProfileIds) {
    if (!map.has(id)) {
      map.set(id, { plan: 'free', entitlements: getEntitlements('free') });
    }
  }

  return map;
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
