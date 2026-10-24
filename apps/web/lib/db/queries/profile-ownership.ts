import 'server-only';

import { asc, sql as drizzleSql, eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { selectDashboardProfile } from '@/lib/db/server';

/**
 * The session-bound DB function sees the complete claim graph despite tenant
 * RLS. Its decision matches resolveProfileAccess and is evaluated in the
 * statement doing the read/write; a selected profile is never authority.
 * Candidate IDs use the existing legacy-owner and claim-user indexes before
 * checking the complete graph, preserving the JOV-6211 hot-path safety index.
 */
export function writableProfileForUser(appUserId: string) {
  return drizzleSql<boolean>`(
    ${appUserId}::uuid = current_app_user_uuid()
    AND ${creatorProfiles.id} IN (
      SELECT legacy_profile.id FROM ${creatorProfiles} legacy_profile
      WHERE legacy_profile.user_id = ${appUserId}::uuid
      UNION
      SELECT own_claim.creator_profile_id FROM ${userProfileClaims} own_claim
      WHERE own_claim.user_id = ${appUserId}::uuid
        AND own_claim.role IN ('owner', 'manager')
    )
    AND current_app_user_can_write_profile(${creatorProfiles.id})
  )`;
}

/** Use the same authorized candidates and fallback selection as the owner shell. */
export async function getActiveWritableProfile(
  tx: DbOrTransaction,
  appUserId: string
) {
  const [user] = await tx
    .select({ activeProfileId: users.activeProfileId })
    .from(users)
    .where(eq(users.id, appUserId))
    .limit(1);
  if (!user) return null;

  const profiles = await tx
    .select()
    .from(creatorProfiles)
    .where(writableProfileForUser(appUserId))
    .orderBy(asc(creatorProfiles.createdAt));
  if (profiles.length === 0) return null;

  return (
    profiles.find(profile => profile.id === user.activeProfileId) ??
    selectDashboardProfile(profiles)
  );
}
