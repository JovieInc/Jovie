/**
 * Fit Scoring Service
 *
 * Handles database operations for calculating and storing fit scores.
 * Provides methods for both individual and batch score calculations.
 */

import {
  and,
  desc,
  inArray,
  sql as drizzleSql,
  eq,
  isNotNull,
  isNull,
} from 'drizzle-orm';

import type { DbOrTransaction } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { socialLinks } from '@/lib/db/schema/links';
import type { FitScoreBreakdown } from '@/lib/db/schema/profiles';
import { creatorContacts, creatorProfiles } from '@/lib/db/schema/profiles';

import {
  calculateFitScore,
  FIT_SCORE_VERSION,
  type FitScoreInput,
} from './calculator';

/**
 * Calculate and store the fit score for a creator profile.
 *
 * This performs an "immediate" calculation using data already in the database.
 * For full scoring including Spotify enrichment, use the background job.
 *
 * @param db - Database client
 * @param creatorProfileId - ID of the profile to score
 * @returns The calculated score and breakdown, or null if profile not found
 */
export async function calculateAndStoreFitScore(
  db: DbOrTransaction,
  creatorProfileId: string
): Promise<{ score: number; breakdown: FitScoreBreakdown } | null> {
  // Fetch profile data with additional DSP IDs
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      spotifyId: creatorProfiles.spotifyId,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      genres: creatorProfiles.genres,
      ingestionSourcePlatform: creatorProfiles.ingestionSourcePlatform,
      appleMusicId: creatorProfiles.appleMusicId,
      soundcloudId: creatorProfiles.soundcloudId,
      deezerId: creatorProfiles.deezerId,
      tidalId: creatorProfiles.tidalId,
      youtubeMusicId: creatorProfiles.youtubeMusicId,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile) {
    return null;
  }

  // Check if we have a contact email
  const [contact] = await db
    .select({ email: creatorContacts.email })
    .from(creatorContacts)
    .where(
      and(
        eq(creatorContacts.creatorProfileId, creatorProfileId),
        isNotNull(creatorContacts.email)
      )
    )
    .limit(1);

  // Fetch social links to detect music tools
  const links = await db
    .select({
      platform: socialLinks.platform,
    })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, creatorProfileId),
        eq(socialLinks.state, 'active')
      )
    );

  // Fetch latest release date
  const [latestRelease] = await db
    .select({
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        isNotNull(discogReleases.releaseDate)
      )
    )
    .orderBy(desc(discogReleases.releaseDate))
    .limit(1);

  // Count DSP platforms
  const dspPlatformCount = [
    profile.spotifyId,
    profile.appleMusicId,
    profile.soundcloudId,
    profile.deezerId,
    profile.tidalId,
    profile.youtubeMusicId,
  ].filter(Boolean).length;

  // Build input for calculator
  const input: FitScoreInput = {
    ingestionSourcePlatform: profile.ingestionSourcePlatform,
    hasPaidTier: false, // Will be set during ingestion
    socialLinkPlatforms: links.map(l => l.platform),
    hasSpotifyId: !!profile.spotifyId,
    spotifyPopularity: profile.spotifyPopularity,
    genres: profile.genres,
    latestReleaseDate: latestRelease?.releaseDate ?? null,
    hasContactEmail: !!contact?.email,
    hasAppleMusicId: !!profile.appleMusicId,
    hasSoundCloudId: !!profile.soundcloudId,
    dspPlatformCount,
  };

  // Calculate score
  const { score, breakdown } = calculateFitScore(input);

  // Store the result
  await db
    .update(creatorProfiles)
    .set({
      fitScore: score,
      fitScoreBreakdown: breakdown,
      fitScoreUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, creatorProfileId));

  return { score, breakdown };
}

/**
 * Recalculate fit scores for all unclaimed profiles that don't have a score yet.
 *
 * @param db - Database client
 * @param limit - Maximum number of profiles to process (for batching)
 * @returns Number of profiles scored
 */
export async function calculateMissingFitScores(
  db: DbOrTransaction,
  limit = 100
): Promise<number> {
  const profiles = await db
    .select({
      id: creatorProfiles.id,
      spotifyId: creatorProfiles.spotifyId,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      genres: creatorProfiles.genres,
      ingestionSourcePlatform: creatorProfiles.ingestionSourcePlatform,
      socialLinkPlatforms: drizzleSql<string[]>`
        coalesce(
          array_agg(distinct ${socialLinks.platform})
            filter (where ${socialLinks.platform} is not null),
          '{}'
        )
      `,
      latestReleaseDate: drizzleSql<Date | null>`
        max(${discogReleases.releaseDate})
      `,
    })
    .from(creatorProfiles)
    .leftJoin(
      socialLinks,
      and(
        eq(socialLinks.creatorProfileId, creatorProfiles.id),
        eq(socialLinks.state, 'active')
      )
    )
    .leftJoin(
      discogReleases,
      and(
        eq(discogReleases.creatorProfileId, creatorProfiles.id),
        isNotNull(discogReleases.releaseDate)
      )
    )
    .where(
      and(
        isNull(creatorProfiles.fitScore),
        eq(creatorProfiles.isClaimed, false)
      )
    )
    .groupBy(creatorProfiles.id)
    .limit(limit);

  if (profiles.length === 0) {
    return 0;
  }

  // Calculate all scores in memory first (no DB calls)
  type ProfileForScoring = (typeof profiles)[number];
  const updates = profiles.map((profile: ProfileForScoring) => {
    const input: FitScoreInput = {
      ingestionSourcePlatform: profile.ingestionSourcePlatform,
      hasPaidTier: false,
      socialLinkPlatforms: profile.socialLinkPlatforms ?? [],
      hasSpotifyId: !!profile.spotifyId,
      spotifyPopularity: profile.spotifyPopularity,
      genres: profile.genres,
      latestReleaseDate: profile.latestReleaseDate ?? null,
    };

    const { score, breakdown } = calculateFitScore(input);
    return { id: profile.id, score, breakdown };
  });

  // Batch update all profiles in a single query using CASE expressions
  if (updates.length > 0) {
    const now = new Date();
    const ids = updates.map((u: (typeof updates)[number]) => u.id);

    // Build CASE expressions for score and breakdown
    const scoreCase = drizzleSql.raw(
      `CASE ${updates.map((u: (typeof updates)[number]) => `WHEN id = '${u.id}' THEN ${u.score}`).join(' ')} END`
    );
    const breakdownCase = drizzleSql.raw(
      `CASE ${updates.map((u: (typeof updates)[number]) => `WHEN id = '${u.id}' THEN '${JSON.stringify(u.breakdown).replaceAll("'", "''")}'::jsonb`).join(' ')} END`
    );

    await db
      .update(creatorProfiles)
      .set({
        fitScore: scoreCase,
        fitScoreBreakdown: breakdownCase,
        fitScoreUpdatedAt: now,
        updatedAt: now,
      })
      .where(inArray(creatorProfiles.id, ids));
  }

  return updates.length;
}

/**
 * Recalculate fit scores for all unclaimed profiles.
 * Use this after updating scoring criteria.
 *
 * Optimized to batch DB operations: fetches all data with JOINs
 * and updates in batches using CASE expressions.
 *
 * @param db - Database client
 * @param batchSize - Number of profiles to process per batch
 * @returns Total number of profiles scored
 */
export async function recalculateAllFitScores(
  db: DbOrTransaction,
  batchSize = 100
): Promise<number> {
  let totalScored = 0;
  let offset = 0;

  while (true) {
    // Fetch profiles with all data needed for scoring in a single query
    const profiles = await db
      .select({
        id: creatorProfiles.id,
        spotifyId: creatorProfiles.spotifyId,
        spotifyPopularity: creatorProfiles.spotifyPopularity,
        genres: creatorProfiles.genres,
        ingestionSourcePlatform: creatorProfiles.ingestionSourcePlatform,
        socialLinkPlatforms: drizzleSql<string[]>`
          coalesce(
            array_agg(distinct ${socialLinks.platform})
              filter (where ${socialLinks.platform} is not null),
            '{}'
          )
        `,
        latestReleaseDate: drizzleSql<Date | null>`
          max(${discogReleases.releaseDate})
        `,
      })
      .from(creatorProfiles)
      .leftJoin(
        socialLinks,
        and(
          eq(socialLinks.creatorProfileId, creatorProfiles.id),
          eq(socialLinks.state, 'active')
        )
      )
      .leftJoin(
        discogReleases,
        and(
          eq(discogReleases.creatorProfileId, creatorProfiles.id),
          isNotNull(discogReleases.releaseDate)
        )
      )
      .where(eq(creatorProfiles.isClaimed, false))
      .groupBy(creatorProfiles.id)
      .limit(batchSize)
      .offset(offset);

    if (profiles.length === 0) {
      break;
    }

    // Calculate all scores in memory
    type BatchProfileForScoring = (typeof profiles)[number];
    const updates = profiles.map((profile: BatchProfileForScoring) => {
      const input: FitScoreInput = {
        ingestionSourcePlatform: profile.ingestionSourcePlatform,
        hasPaidTier: false,
        socialLinkPlatforms: profile.socialLinkPlatforms ?? [],
        hasSpotifyId: !!profile.spotifyId,
        spotifyPopularity: profile.spotifyPopularity,
        genres: profile.genres,
        latestReleaseDate: profile.latestReleaseDate ?? null,
      };

      const { score, breakdown } = calculateFitScore(input);
      return { id: profile.id, score, breakdown };
    });

    // Batch update all profiles in a single query
    if (updates.length > 0) {
      const now = new Date();
      const ids = updates.map((u: (typeof updates)[number]) => u.id);

      const scoreCase = drizzleSql.raw(
        `CASE ${updates.map((u: (typeof updates)[number]) => `WHEN id = '${u.id}' THEN ${u.score}`).join(' ')} END`
      );
      const breakdownCase = drizzleSql.raw(
        `CASE ${updates.map((u: (typeof updates)[number]) => `WHEN id = '${u.id}' THEN '${JSON.stringify(u.breakdown).replaceAll("'", "''")}'::jsonb`).join(' ')} END`
      );

      await db
        .update(creatorProfiles)
        .set({
          fitScore: scoreCase,
          fitScoreBreakdown: breakdownCase,
          fitScoreUpdatedAt: now,
          updatedAt: now,
        })
        .where(inArray(creatorProfiles.id, ids));

      totalScored += updates.length;
    }

    offset += batchSize;
  }

  return totalScored;
}

/**
 * Get top-scoring unclaimed profiles for GTM outreach.
 *
 * @param db - Database client
 * @param limit - Maximum number of profiles to return
 * @param minScore - Minimum fit score threshold
 * @returns Array of profiles sorted by fit score descending
 */
export async function getTopFitProfiles(
  db: DbOrTransaction,
  limit = 50,
  minScore = 0
): Promise<
  Array<{
    id: string;
    username: string;
    displayName: string | null;
    fitScore: number | null;
    fitScoreBreakdown: FitScoreBreakdown | null;
    spotifyUrl: string | null;
    ingestionSourcePlatform: string | null;
  }>
> {
  return db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      fitScore: creatorProfiles.fitScore,
      fitScoreBreakdown: creatorProfiles.fitScoreBreakdown,
      spotifyUrl: creatorProfiles.spotifyUrl,
      ingestionSourcePlatform: creatorProfiles.ingestionSourcePlatform,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isClaimed, false),
        isNotNull(creatorProfiles.fitScore),
        drizzleSql`${creatorProfiles.fitScore} >= ${minScore}`
      )
    )
    .orderBy(desc(creatorProfiles.fitScore))
    .limit(limit);
}

/**
 * Update fit score with paid tier detection result.
 * Called after ingestion detects whether the source has branding.
 *
 * @param db - Database client
 * @param creatorProfileId - ID of the profile to update
 * @param hasPaidTier - Whether the link-in-bio has no branding (paid tier)
 */
export async function updatePaidTierScore(
  db: DbOrTransaction,
  creatorProfileId: string,
  hasPaidTier: boolean
): Promise<void> {
  // Fetch current breakdown
  const [profile] = await db
    .select({
      fitScore: creatorProfiles.fitScore,
      fitScoreBreakdown: creatorProfiles.fitScoreBreakdown,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile?.fitScoreBreakdown) {
    // No existing score, do a full calculation
    await calculateAndStoreFitScore(db, creatorProfileId);
    return;
  }

  const breakdown = profile.fitScoreBreakdown as FitScoreBreakdown;
  const oldPaidTierScore = breakdown.paidTier || 0;
  const newPaidTierScore = hasPaidTier ? 20 : 0;

  if (oldPaidTierScore === newPaidTierScore) {
    return; // No change needed
  }

  // Update the breakdown and total score
  const newScore =
    (profile.fitScore || 0) - oldPaidTierScore + newPaidTierScore;
  breakdown.paidTier = newPaidTierScore;
  breakdown.meta = {
    ...breakdown.meta,
    calculatedAt: new Date().toISOString(),
    version: FIT_SCORE_VERSION,
  };

  await db
    .update(creatorProfiles)
    .set({
      fitScore: newScore,
      fitScoreBreakdown: breakdown,
      fitScoreUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, creatorProfileId));
}
