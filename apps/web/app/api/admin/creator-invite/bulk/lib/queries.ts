/**
 * Bulk Invite Database Queries
 *
 * Database queries for fetching eligible profiles.
 */

import { and, sql as drizzleSql, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  creatorClaimInvites,
  creatorContacts,
  creatorProfiles,
} from '@/lib/db/schema/profiles';
import { coldClaimInviteRelationshipHold } from '@/lib/outbound/cold-claim-invites';

export interface EligibleProfile {
  id: string;
  username: string;
  displayName: string | null;
  fitScore: number | null;
  contactEmail: string | null;
}

/** Artists Tim already works with are never eligible for a cold invite. */
function withoutRelationshipHolds(
  profiles: EligibleProfile[]
): EligibleProfile[] {
  return profiles.filter(
    profile =>
      coldClaimInviteRelationshipHold({
        username: profile.username,
        displayName: profile.displayName,
        email: profile.contactEmail,
      }) === null
  );
}

/**
 * Fetch specific profiles by ID for bulk invite.
 */
export async function fetchProfilesById(
  profileIds: string[],
  limit: number
): Promise<EligibleProfile[]> {
  const rows = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      fitScore: creatorProfiles.fitScore,
      contactEmail: creatorContacts.email,
    })
    .from(creatorProfiles)
    .leftJoin(
      creatorContacts,
      and(
        eq(creatorContacts.creatorProfileId, creatorProfiles.id),
        eq(creatorContacts.isActive, true)
      )
    )
    .where(
      and(
        inArray(creatorProfiles.id, profileIds),
        eq(creatorProfiles.isClaimed, false)
      )
    )
    .limit(limit);
  return withoutRelationshipHolds(rows);
}

/**
 * Fetch eligible profiles by fit score threshold.
 * Used for both auto-selection and preview endpoints.
 */
export async function fetchProfilesByFitScore(
  fitScoreThreshold: number,
  limit: number
): Promise<EligibleProfile[]> {
  const rows = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      fitScore: creatorProfiles.fitScore,
      contactEmail: creatorContacts.email,
    })
    .from(creatorProfiles)
    .leftJoin(
      creatorContacts,
      and(
        eq(creatorContacts.creatorProfileId, creatorProfiles.id),
        eq(creatorContacts.isActive, true)
      )
    )
    .leftJoin(
      creatorClaimInvites,
      eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(creatorProfiles.isClaimed, false),
        gte(creatorProfiles.fitScore, fitScoreThreshold),
        isNull(creatorClaimInvites.id) // No existing invites
      )
    )
    .orderBy(drizzleSql`${creatorProfiles.fitScore} DESC`)
    .limit(limit);
  return withoutRelationshipHolds(rows);
}

/**
 * Fetch eligible profiles for preview (GET endpoint).
 * @deprecated Use fetchProfilesByFitScore instead - identical implementation.
 */
export const fetchEligibleProfilesForPreview = fetchProfilesByFitScore;

/**
 * Get total count of eligible profiles for a given threshold.
 */
export async function getEligibleProfileCount(
  fitScoreThreshold: number
): Promise<number> {
  const [countResult] = await db
    .select({ count: drizzleSql<number>`count(*)` })
    .from(creatorProfiles)
    .leftJoin(
      creatorClaimInvites,
      eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(creatorProfiles.isClaimed, false),
        gte(creatorProfiles.fitScore, fitScoreThreshold),
        isNull(creatorClaimInvites.id)
      )
    );

  return Number(countResult?.count ?? 0);
}
