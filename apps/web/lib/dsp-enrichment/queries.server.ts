/**
 * Server-side DSP match queries.
 *
 * Extracted from the /api/dsp/matches route handler so the same
 * query logic can be reused for SSR prefetching in page server components.
 */

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';

const MAX_MATCHES = 200;

/**
 * Fetches DSP artist matches for a creator profile with ownership verification.
 *
 * @param profileId - Creator profile ID
 * @param clerkUserId - Clerk user ID for ownership check
 * @param status - Optional status filter (omit or 'all' for no filter)
 * @returns Array of DSP match objects
 * @throws Error if profile not found or user lacks permission
 */
export async function getDspMatchesForProfile(
  profileId: string,
  clerkUserId: string,
  status?: DspMatchStatus | 'all'
) {
  // Verify user owns this profile
  const [profile] = await db
    .select({ id: creatorProfiles.id, clerkId: users.clerkId })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  if (!profile) {
    throw new Error('Profile not found');
  }

  if (profile.clerkId !== clerkUserId) {
    throw new Error('You do not have permission to view this profile');
  }

  // Build query conditions
  const conditions = [eq(dspArtistMatches.creatorProfileId, profileId)];

  if (status && status !== 'all') {
    conditions.push(eq(dspArtistMatches.status, status));
  }

  const matches = await db
    .select({
      id: dspArtistMatches.id,
      providerId: dspArtistMatches.providerId,
      externalArtistId: dspArtistMatches.externalArtistId,
      externalArtistName: dspArtistMatches.externalArtistName,
      externalArtistUrl: dspArtistMatches.externalArtistUrl,
      externalArtistImageUrl: dspArtistMatches.externalArtistImageUrl,
      confidenceScore: dspArtistMatches.confidenceScore,
      confidenceBreakdown: dspArtistMatches.confidenceBreakdown,
      matchingIsrcCount: dspArtistMatches.matchingIsrcCount,
      matchingUpcCount: dspArtistMatches.matchingUpcCount,
      totalTracksChecked: dspArtistMatches.totalTracksChecked,
      status: dspArtistMatches.status,
      createdAt: dspArtistMatches.createdAt,
      updatedAt: dspArtistMatches.updatedAt,
    })
    .from(dspArtistMatches)
    .where(and(...conditions))
    .orderBy(dspArtistMatches.createdAt)
    .limit(MAX_MATCHES);

  // Transform decimal to number for JSON-compatible output
  return matches.map(match => ({
    ...match,
    confidenceScore: match.confidenceScore
      ? Number.parseFloat(match.confidenceScore)
      : null,
  }));
}
