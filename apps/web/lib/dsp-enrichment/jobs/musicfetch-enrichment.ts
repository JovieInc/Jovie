/**
 * MusicFetch Enrichment Job Processor
 *
 * Enriches creator profiles with cross-platform DSP links and social profiles
 * using MusicFetch.io. Given a Spotify artist URL, discovers the artist's
 * profiles across 30+ platforms and saves DSP IDs, social links, and bio.
 *
 * Triggered after a user connects their Spotify profile during onboarding.
 */

import 'server-only';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { type DbOrTransaction } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { importReleasesFromSpotify } from '@/lib/discography/spotify-import';
import {
  extractMusicFetchLinks,
  type MusicFetchProfileFieldState,
  mapMusicFetchProfileFields,
} from '@/lib/dsp-enrichment/musicfetch-mapping';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/merge';
import { MusicfetchRequestError } from '@/lib/musicfetch/resilient-client';
import { logger } from '@/lib/utils/logger';
import { setEnrichmentJobStatus } from '../enrichment-status';
import {
  fetchArtistBySpotifyUrl,
  isMusicFetchAvailable,
  type MusicFetchArtistResult,
} from '../providers/musicfetch';

// ============================================================================
// Payload Schema
// ============================================================================

export const musicFetchEnrichmentPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  spotifyUrl: z.string().url(),
  dedupKey: z.string(),
});

export type MusicFetchEnrichmentPayload = z.infer<
  typeof musicFetchEnrichmentPayloadSchema
>;

// ============================================================================
// Result Type
// ============================================================================

export interface MusicFetchEnrichmentResult {
  creatorProfileId: string;
  dspFieldsUpdated: string[];
  socialLinksInserted: number;
  socialLinksUpdated: number;
  releasesImported: number;
  releasesFailed: number;
  errors: string[];
}

// ============================================================================
// Field + Link Mapping
// ============================================================================

// ============================================================================
// Job Processor
// ============================================================================

async function applyDspUpdates(
  tx: DbOrTransaction,
  artistData: MusicFetchArtistResult,
  profile: MusicFetchProfileFieldState & {
    id: string;
    usernameNormalized: string | null;
    username: string | null;
    displayName: string | null;
    displayNameLocked: boolean | null;
    avatarLockedByUser: boolean | null;
  },
  spotifyUrl: string,
  creatorProfileId: string
): Promise<string[]> {
  const dspUpdates = mapMusicFetchProfileFields(
    artistData,
    profile,
    spotifyUrl
  );

  let enrichedDisplayName: string | undefined;
  const hasPlaceholderName =
    !profile.displayName ||
    profile.displayName === profile.usernameNormalized ||
    profile.displayName === profile.username;
  if (artistData.name && !profile.displayNameLocked && hasPlaceholderName) {
    enrichedDisplayName = artistData.name;
  }

  if (profile.avatarLockedByUser) {
    delete dspUpdates.avatarUrl;
  }

  const dspFieldNames = Object.keys(dspUpdates);
  if (enrichedDisplayName) dspFieldNames.push('displayName');

  if (dspFieldNames.length > 0) {
    await tx
      .update(creatorProfiles)
      .set({
        ...dspUpdates,
        ...(enrichedDisplayName ? { displayName: enrichedDisplayName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, creatorProfileId));

    logger.info('MusicFetch enrichment: updated profile DSP fields', {
      creatorProfileId,
      fields: dspFieldNames,
    });
  }

  return dspFieldNames;
}

async function mergeSocialLinks(
  tx: DbOrTransaction,
  artistData: MusicFetchArtistResult,
  profile: {
    id: string;
    usernameNormalized: string | null;
    avatarUrl: string | null;
    displayName: string | null;
    avatarLockedByUser: boolean | null;
    displayNameLocked: boolean | null;
  },
  spotifyUrl: string
): Promise<{ inserted: number; updated: number }> {
  const socialLinks = extractMusicFetchLinks(
    artistData,
    spotifyUrl,
    'musicfetch_artist_lookup'
  );
  if (socialLinks.length === 0) return { inserted: 0, updated: 0 };

  const mergeResult = await normalizeAndMergeExtraction(
    tx,
    {
      id: profile.id,
      usernameNormalized: profile.usernameNormalized,
      avatarUrl: profile.avatarUrl,
      displayName: profile.displayName,
      avatarLockedByUser: profile.avatarLockedByUser,
      displayNameLocked: profile.displayNameLocked,
    },
    {
      links: socialLinks,
      sourcePlatform: 'musicfetch',
      sourceUrl: spotifyUrl,
    }
  );

  logger.info('MusicFetch enrichment: merged social links', {
    creatorProfileId: profile.id,
    inserted: mergeResult.inserted,
    updated: mergeResult.updated,
  });

  return { inserted: mergeResult.inserted, updated: mergeResult.updated };
}

async function importDiscography(
  spotifyUrl: string,
  existingSpotifyId: string | null,
  creatorProfileId: string,
  result: MusicFetchEnrichmentResult
): Promise<void> {
  const spotifyId = extractSpotifyArtistId(spotifyUrl, existingSpotifyId);
  if (!spotifyId) return;

  try {
    const importResult = await importReleasesFromSpotify(
      creatorProfileId,
      spotifyId
    );
    result.releasesImported = importResult.imported;
    result.releasesFailed = importResult.failed;

    if (importResult.errors.length > 0) {
      result.errors.push(...importResult.errors);
    }

    logger.info('MusicFetch enrichment: imported Spotify discography', {
      creatorProfileId,
      imported: importResult.imported,
      failed: importResult.failed,
      totalReleases: importResult.releases.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Spotify import failed';
    result.errors.push(`Spotify discography import failed: ${message}`);
    logger.error('MusicFetch enrichment: Spotify import failed', {
      creatorProfileId,
      error: message,
    });
  }
}

/**
 * Process a MusicFetch enrichment job.
 *
 * 1. Calls MusicFetch.io with the Spotify artist URL
 * 2. Maps DSP services to profile fields (only sets null fields)
 * 3. Creates social_links entries for Instagram, TikTok, etc.
 * 4. Updates bio if the profile has none
 * 5. Imports Spotify discography (releases, tracks, cross-platform links)
 */
export async function processMusicFetchEnrichmentJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<MusicFetchEnrichmentResult> {
  const payload = musicFetchEnrichmentPayloadSchema.parse(jobPayload);
  const { creatorProfileId, spotifyUrl } = payload;

  const result: MusicFetchEnrichmentResult = {
    creatorProfileId,
    dspFieldsUpdated: [],
    socialLinksInserted: 0,
    socialLinksUpdated: 0,
    releasesImported: 0,
    releasesFailed: 0,
    errors: [],
  };

  // Check availability — throw so the job fails and retries
  if (!isMusicFetchAvailable()) {
    await setEnrichmentJobStatus(tx, creatorProfileId, 'musicfetch', 'failed');
    throw new Error('MusicFetch API token not configured');
  }

  // Fetch existing profile
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      displayNameLocked: creatorProfiles.displayNameLocked,
      avatarUrl: creatorProfiles.avatarUrl,
      avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      bio: creatorProfiles.bio,
      spotifyUrl: creatorProfiles.spotifyUrl,
      spotifyId: creatorProfiles.spotifyId,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      appleMusicId: creatorProfiles.appleMusicId,
      youtubeUrl: creatorProfiles.youtubeUrl,
      youtubeMusicId: creatorProfiles.youtubeMusicId,
      deezerId: creatorProfiles.deezerId,
      tidalId: creatorProfiles.tidalId,
      soundcloudId: creatorProfiles.soundcloudId,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile) {
    result.errors.push('Creator profile not found');
    await setEnrichmentJobStatus(tx, creatorProfileId, 'musicfetch', 'failed');
    return result;
  }

  // Call MusicFetch API — only retry on transient errors (5xx, timeouts)
  let artistData;
  try {
    artistData = await fetchArtistBySpotifyUrl(spotifyUrl);
  } catch (error) {
    // 400 = bad URL, removed artist, non-artist entity — permanent failure, don't retry
    if (error instanceof MusicfetchRequestError && error.statusCode === 400) {
      logger.warn('MusicFetch enrichment: permanent failure (400)', {
        creatorProfileId,
        spotifyUrl,
      });
      result.errors.push(`MusicFetch API rejected request: ${error.message}`);
      await setEnrichmentJobStatus(
        tx,
        creatorProfileId,
        'musicfetch',
        'failed'
      );
      return result;
    }
    // Transient errors (5xx, timeout, network) — re-throw to trigger retry
    await setEnrichmentJobStatus(tx, creatorProfileId, 'musicfetch', 'failed');
    throw error;
  }

  if (!artistData) {
    logger.warn('MusicFetch enrichment: API returned no data', {
      creatorProfileId,
      spotifyUrl,
    });
    result.errors.push('MusicFetch API returned no data');
    await setEnrichmentJobStatus(tx, creatorProfileId, 'musicfetch', 'failed');
    return result;
  }

  // Apply DSP field updates, merge social links, and import discography
  result.dspFieldsUpdated = await applyDspUpdates(
    tx,
    artistData,
    profile,
    spotifyUrl,
    creatorProfileId
  );
  const linkResult = await mergeSocialLinks(
    tx,
    artistData,
    profile,
    spotifyUrl
  );
  result.socialLinksInserted = linkResult.inserted;
  result.socialLinksUpdated = linkResult.updated;
  await importDiscography(
    spotifyUrl,
    profile.spotifyId,
    creatorProfileId,
    result
  );

  // Mark enrichment as complete
  await setEnrichmentJobStatus(tx, creatorProfileId, 'musicfetch', 'complete');

  return result;
}

/**
 * Extract a Spotify artist ID from a Spotify URL or existing profile field.
 */
function extractSpotifyArtistId(
  spotifyUrl: string,
  existingSpotifyId: string | null
): string | null {
  if (existingSpotifyId) return existingSpotifyId;

  try {
    const url = new URL(spotifyUrl);
    // Handle https://open.spotify.com/artist/{id} URLs
    const match = /\/artist\/([a-zA-Z0-9]+)/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
