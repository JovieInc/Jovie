/**
 * DSP Artist Discovery Job Processor
 *
 * Discovers matching artist profiles on other DSPs (like Apple Music)
 * for a creator profile. Uses ISRC-based matching with confidence scoring.
 *
 * Triggered after a user connects their Spotify profile to automatically
 * discover matching profiles on other platforms.
 */

import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { z } from 'zod';

import { type DbOrTransaction, db } from '@/lib/db';
import { discogTracks } from '@/lib/db/schema/content';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';

import { enqueueDspTrackEnrichmentJob } from '@/lib/ingestion/jobs';
import { logger } from '@/lib/utils/logger';

import {
  convertAppleMusicToIsrcMatches,
  type LocalArtistData,
  type LocalTrackData,
  orchestrateMatching,
  selectTracksForMatching,
  validateMatch,
} from '../matching';
import {
  bulkLookupByIsrc,
  getArtist,
  isAppleMusicAvailable,
  MAX_ISRC_BATCH_SIZE,
} from '../providers/apple-music';
import type {
  DspArtistDiscoveryResult,
  DspMatchStatus,
  DspProviderId,
  ScoredArtistMatch,
} from '../types';

// ============================================================================
// Payload Schema
// ============================================================================

export const dspArtistDiscoveryPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  spotifyArtistId: z.string(),
  targetProviders: z
    .array(z.enum(['apple_music', 'deezer', 'musicbrainz']))
    .default(['apple_music']),
  dedupKey: z.string(),
});

export type DspArtistDiscoveryPayloadSchema = z.infer<
  typeof dspArtistDiscoveryPayloadSchema
>;

// ============================================================================
// Constants
// ============================================================================

/** Minimum tracks needed to attempt discovery */
const MIN_TRACKS_FOR_DISCOVERY = 3;

/** Maximum tracks to sample for ISRC matching */
const MAX_TRACKS_FOR_MATCHING = 20;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch local tracks with ISRCs for a creator profile.
 */
async function fetchLocalTracks(
  tx: DbOrTransaction,
  creatorProfileId: string
): Promise<LocalTrackData[]> {
  const tracks = await tx
    .select({
      id: discogTracks.id,
      title: discogTracks.title,
      isrc: discogTracks.isrc,
    })
    .from(discogTracks)
    .where(
      and(
        eq(discogTracks.creatorProfileId, creatorProfileId),
        drizzleSql`${discogTracks.isrc} IS NOT NULL`
      )
    )
    .orderBy(discogTracks.createdAt)
    .limit(100);

  return tracks.map(t => ({
    id: t.id,
    title: t.title,
    isrc: t.isrc,
  }));
}

/**
 * Fetch local artist data for matching.
 */
async function fetchLocalArtist(
  tx: DbOrTransaction,
  creatorProfileId: string,
  spotifyArtistId: string
): Promise<LocalArtistData | null> {
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      usernameNormalized: creatorProfiles.usernameNormalized,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      genres: creatorProfiles.genres,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    name: profile.displayName ?? profile.usernameNormalized ?? 'Unknown Artist',
    spotifyId: spotifyArtistId,
    followers: profile.spotifyFollowers ?? null,
    genres: profile.genres ?? null,
  };
}

/**
 * Store a match result in the database.
 */
async function storeMatch(
  tx: DbOrTransaction,
  creatorProfileId: string,
  providerId: DspProviderId,
  match: ScoredArtistMatch,
  status: DspMatchStatus
): Promise<string> {
  const now = new Date();

  const [result] = await tx
    .insert(dspArtistMatches)
    .values({
      creatorProfileId,
      providerId,
      externalArtistId: match.externalArtistId,
      externalArtistName: match.externalArtistName,
      externalArtistUrl: match.externalArtistUrl ?? null,
      externalArtistImageUrl: match.externalArtistImageUrl ?? null,
      confidenceScore: String(match.confidenceScore),
      confidenceBreakdown: {
        ...match.confidenceBreakdown,
        meta: {
          calculatedAt: now.toISOString(),
          version: 1,
          matchingIsrcs: match.matchingIsrcs.slice(0, 10), // Limit stored ISRCs
        },
      },
      matchingIsrcCount: match.matchingIsrcs.length,
      matchingUpcCount: match.matchingUpcs.length,
      totalTracksChecked: match.totalTracksChecked,
      status,
      confirmedAt: status === 'auto_confirmed' ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dspArtistMatches.creatorProfileId, dspArtistMatches.providerId],
      set: {
        externalArtistId: match.externalArtistId,
        externalArtistName: match.externalArtistName,
        externalArtistUrl: match.externalArtistUrl ?? null,
        externalArtistImageUrl: match.externalArtistImageUrl ?? null,
        confidenceScore: String(match.confidenceScore),
        confidenceBreakdown: {
          ...match.confidenceBreakdown,
          meta: {
            calculatedAt: now.toISOString(),
            version: 1,
            matchingIsrcs: match.matchingIsrcs.slice(0, 10),
          },
        },
        matchingIsrcCount: match.matchingIsrcs.length,
        matchingUpcCount: match.matchingUpcs.length,
        totalTracksChecked: match.totalTracksChecked,
        status,
        confirmedAt: status === 'auto_confirmed' ? now : null,
        updatedAt: now,
      },
    })
    .returning({ id: dspArtistMatches.id });

  return result.id;
}

// ============================================================================
// Provider-Specific Discovery
// ============================================================================

/**
 * Discover Apple Music artist match.
 */
async function discoverAppleMusicMatch(
  tx: DbOrTransaction,
  localTracks: LocalTrackData[],
  localArtist: LocalArtistData,
  creatorProfileId: string
): Promise<{
  match: ScoredArtistMatch | null;
  status: DspMatchStatus | null;
  error?: string;
}> {
  if (!isAppleMusicAvailable()) {
    return { match: null, status: null, error: 'Apple Music not available' };
  }

  // Select tracks for matching
  const selectedTracks = selectTracksForMatching(
    localTracks,
    MAX_TRACKS_FOR_MATCHING
  );

  if (selectedTracks.length < MIN_TRACKS_FOR_DISCOVERY) {
    return {
      match: null,
      status: null,
      error: `Not enough tracks with ISRCs (need ${MIN_TRACKS_FOR_DISCOVERY}, have ${selectedTracks.length})`,
    };
  }

  // Batch lookup ISRCs
  const isrcs = selectedTracks
    .map(t => t.isrc)
    .filter((isrc): isrc is string => isrc !== null);

  // Process in batches of 25 (Apple Music limit)
  const allTracks = new Map<
    string,
    Awaited<ReturnType<typeof bulkLookupByIsrc>> extends Map<string, infer T>
      ? T
      : never
  >();

  for (let i = 0; i < isrcs.length; i += MAX_ISRC_BATCH_SIZE) {
    const batch = isrcs.slice(i, i + MAX_ISRC_BATCH_SIZE);
    const batchResults = await bulkLookupByIsrc(batch);
    for (const [isrc, track] of batchResults) {
      allTracks.set(isrc, track);
    }
  }

  // Convert to ISRC match results
  const rawIsrcMatches = convertAppleMusicToIsrcMatches(
    allTracks,
    selectedTracks
  );

  // Filter out Various Artists and compilation matches to prevent false positives
  const isrcMatches = rawIsrcMatches.filter(m => {
    const name = m.matchedTrack.artistName.toLowerCase();
    return (
      !name.includes('various artists') &&
      !name.includes('various artist') &&
      !name.includes('compilation')
    );
  });

  if (isrcMatches.length === 0) {
    return {
      match: null,
      status: null,
      error: 'No valid ISRC matches found (filtered compilations)',
    };
  }

  // Fetch artist profiles for enrichment - parallelized to avoid N+1 queries
  const artistIdList = Array.from(
    new Set(isrcMatches.map(m => m.matchedTrack.artistId))
  ).filter(id => id !== 'unknown');

  const artistProfiles = new Map<
    string,
    { url?: string; imageUrl?: string; name?: string }
  >();

  // Fetch artist profiles in parallel with concurrency limit
  const ARTIST_FETCH_CONCURRENCY = 5;
  for (let i = 0; i < artistIdList.length; i += ARTIST_FETCH_CONCURRENCY) {
    const batch = artistIdList.slice(i, i + ARTIST_FETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(id => getArtist(id)));

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        const artist = result.value;
        artistProfiles.set(batch[idx], {
          url: artist.attributes?.url,
          imageUrl: artist.attributes?.artwork?.url
            ?.replace('{w}', '300')
            .replace('{h}', '300'),
          name: artist.attributes?.name,
        });
      }
      // Rejected promises are silently ignored (continue without profile data)
    });
  }

  // Orchestrate matching with minimum 3 ISRC matches for safer auto-confirmation
  const matchingResult = orchestrateMatching(
    'apple_music',
    isrcMatches,
    localArtist,
    {
      minIsrcMatches: 3,
      artistProfiles,
    }
  );

  if (!matchingResult.bestMatch) {
    return {
      match: null,
      status: null,
      error: matchingResult.errors.join('; ') || 'No match found',
    };
  }

  // Validate the match
  const validation = validateMatch(matchingResult.bestMatch, localArtist);
  if (!validation.valid) {
    return {
      match: null,
      status: null,
      error: validation.reason ?? 'Match validation failed',
    };
  }

  // Determine status (auto-confirm if threshold met)
  const status: DspMatchStatus = matchingResult.bestMatch.shouldAutoConfirm
    ? 'auto_confirmed'
    : 'suggested';

  // Store the match
  const matchId = await storeMatch(
    tx,
    creatorProfileId,
    'apple_music',
    matchingResult.bestMatch,
    status
  );

  // If auto-confirmed, update the creator profile and enqueue release enrichment
  if (status === 'auto_confirmed') {
    await tx
      .update(creatorProfiles)
      .set({ appleMusicId: matchingResult.bestMatch.externalArtistId })
      .where(eq(creatorProfiles.id, creatorProfileId));

    // Fire-and-forget: enqueue release enrichment to link Apple Music URLs
    void enqueueDspTrackEnrichmentJob({
      creatorProfileId,
      matchId,
      providerId: 'apple_music',
      externalArtistId: matchingResult.bestMatch.externalArtistId,
    }).catch(error => {
      logger.warn('Failed to enqueue release enrichment after auto-confirm', {
        creatorProfileId,
        matchId,
        error,
      });
    });
  }

  return { match: matchingResult.bestMatch, status };
}

// ============================================================================
// Job Processor
// ============================================================================

/**
 * Process a DSP artist discovery job.
 *
 * Discovers matching artist profiles on target DSPs using ISRC-based matching.
 *
 * @param tx - Database transaction
 * @param jobPayload - Job payload
 * @returns Discovery result with matches found
 */
export async function processDspArtistDiscoveryJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<DspArtistDiscoveryResult> {
  const payload = dspArtistDiscoveryPayloadSchema.parse(jobPayload);
  const { creatorProfileId, spotifyArtistId, targetProviders } = payload;

  const result: DspArtistDiscoveryResult = {
    creatorProfileId,
    matches: [],
    errors: [],
  };

  // Fetch local data
  const [localTracks, localArtist] = await Promise.all([
    fetchLocalTracks(tx, creatorProfileId),
    fetchLocalArtist(tx, creatorProfileId, spotifyArtistId),
  ]);

  if (!localArtist) {
    result.errors.push('Creator profile not found');
    return result;
  }

  if (localTracks.length < MIN_TRACKS_FOR_DISCOVERY) {
    result.errors.push(
      `Not enough tracks with ISRCs (need ${MIN_TRACKS_FOR_DISCOVERY}, have ${localTracks.length})`
    );
    return result;
  }

  // Process each target provider
  for (const providerId of targetProviders) {
    try {
      if (providerId === 'apple_music') {
        const { match, status, error } = await discoverAppleMusicMatch(
          tx,
          localTracks,
          localArtist,
          creatorProfileId
        );

        if (match && status) {
          result.matches.push({
            providerId: 'apple_music',
            status,
            externalArtistId: match.externalArtistId,
            externalArtistName: match.externalArtistName,
            confidenceScore: match.confidenceScore,
          });
        } else if (error) {
          result.errors.push(`Apple Music: ${error}`);
        }
      }
      // See JOV-479: Add Deezer and MusicBrainz support
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      result.errors.push(`${providerId}: ${message}`);
    }
  }

  return result;
}

/**
 * Process discovery job with standalone database operations.
 * Used when called from API routes.
 * The neon-http driver does not support transactions.
 */
export async function processDspArtistDiscoveryJobStandalone(
  jobPayload: unknown
): Promise<DspArtistDiscoveryResult> {
  return processDspArtistDiscoveryJob(db, jobPayload);
}
