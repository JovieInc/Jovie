/**
 * Bulk Invite Database Queries
 *
 * Database queries for fetching eligible profiles.
 */

import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  creatorClaimInvites,
  creatorContacts,
  creatorProfiles,
} from '@/lib/db/schema';

export interface EligibleProfile {
  id: string;
  username: string;
  displayName: string | null;
  fitScore: number | null;
  contactEmail: string | null;
}

/**
 * Fetch specific profiles by ID for bulk invite.
 */
export async function fetchProfilesById(
  profileIds: string[],
  limit: number
): Promise<EligibleProfile[]> {
  return db
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
        eq(creatorProfiles.isClaimed, false),
        isNotNull(creatorProfiles.claimToken)
      )
    )
    .limit(limit);
}

/**
 * Fetch eligible profiles by fit score threshold.
 * Used for both auto-selection and preview endpoints.
 */
export async function fetchProfilesByFitScore(
  fitScoreThreshold: number,
  limit: number
): Promise<EligibleProfile[]> {
  return db
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
        isNotNull(creatorProfiles.claimToken),
        gte(creatorProfiles.fitScore, fitScoreThreshold),
        isNull(creatorClaimInvites.id) // No existing invites
      )
    )
    .orderBy(sql`${creatorProfiles.fitScore} DESC`)
    .limit(limit);
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
    .select({ count: sql<number>`count(*)` })
    .from(creatorProfiles)
    .leftJoin(
      creatorClaimInvites,
      eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(creatorProfiles.isClaimed, false),
        isNotNull(creatorProfiles.claimToken),
        gte(creatorProfiles.fitScore, fitScoreThreshold),
        isNull(creatorClaimInvites.id)
      )
    );

  return Number(countResult?.count ?? 0);
}
