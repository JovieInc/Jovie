import 'server-only';
import { and, desc, sql as drizzleSql, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { escapeLikePattern } from '@/lib/utils/sql';
import type { ListCreator } from './types';

/**
 * Read-only view of existing ingested creator profiles for list rows and the
 * auto-fill candidate pool. No new registry: creatorProfiles stays the owner.
 */

/** Bounded pool keeps one suggest call cheap at founder-dogfood scale. */
export const CANDIDATE_POOL_LIMIT = 1_000;

const COLUMNS = {
  id: creatorProfiles.id,
  username: creatorProfiles.username,
  displayName: creatorProfiles.displayName,
  avatarUrl: creatorProfiles.avatarUrl,
  genres: creatorProfiles.genres,
  spotifyFollowers: creatorProfiles.spotifyFollowers,
  spotifyPopularity: creatorProfiles.spotifyPopularity,
  location: creatorProfiles.location,
  activeSinceYear: creatorProfiles.activeSinceYear,
  isVerified: creatorProfiles.isVerified,
  isClaimed: creatorProfiles.isClaimed,
} as const;

export async function getListCreatorsByIds(
  ids: readonly string[]
): Promise<ListCreator[]> {
  if (ids.length === 0) return [];
  return db
    .select(COLUMNS)
    .from(creatorProfiles)
    .where(inArray(creatorProfiles.id, [...ids]));
}

/**
 * Candidates need at least one genre so a suggestion can say why. Most
 * followed first, so a capped pool still favours enriched profiles.
 */
export async function getCandidatePool(): Promise<ListCreator[]> {
  return db
    .select(COLUMNS)
    .from(creatorProfiles)
    .where(
      and(
        isNotNull(creatorProfiles.genres),
        drizzleSql`cardinality(${creatorProfiles.genres}) > 0`
      )
    )
    .orderBy(desc(drizzleSql`coalesce(${creatorProfiles.spotifyFollowers}, 0)`))
    .limit(CANDIDATE_POOL_LIMIT);
}

/** Case-insensitive name/handle search for adding creators by hand. */
export async function searchListCreators(
  query: string,
  limit = 20
): Promise<ListCreator[]> {
  const term = query.trim();
  if (!term) return [];
  const pattern = `%${escapeLikePattern(term)}%`;
  return db
    .select(COLUMNS)
    .from(creatorProfiles)
    .where(
      drizzleSql`(${creatorProfiles.displayName} ilike ${pattern} or ${creatorProfiles.usernameNormalized} ilike ${pattern})`
    )
    .orderBy(desc(drizzleSql`coalesce(${creatorProfiles.spotifyFollowers}, 0)`))
    .limit(limit);
}
