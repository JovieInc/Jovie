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

import { sql as drizzleSql, eq, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';

import { type DbOrTransaction, db as plainDb } from '@/lib/db';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { importReleasesFromSpotify } from '@/lib/discography/spotify-import';
import {
  extractAllMusicFetchServices,
  extractMusicFetchLinks,
  type MusicFetchProfileFieldState,
  mapMusicFetchProfileFields,
} from '@/lib/dsp-enrichment/musicfetch-mapping';
import {
  MUSICFETCH_SERVICE_TO_DSP,
  STREAMING_DSP_KEYS,
} from '@/lib/dsp-registry';
import { publishIdentityLinks } from '@/lib/identity/publish';
import { storeRawIdentityLinks } from '@/lib/identity/store';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/merge';
import { detectAndStoreSoundCloudProStatus } from '@/lib/ingestion/strategies/soundcloud';
import {
  isMusicfetchInvalidServicesError,
  MusicfetchRequestError,
} from '@/lib/musicfetch/resilient-client';
import { isBlacklistedSpotifyId } from '@/lib/spotify/blacklist';
import { logger } from '@/lib/utils/logger';
import { setEnrichmentJobStatus } from '../enrichment-status';
import {
  fetchArtistBySpotifyUrl,
  getMusicFetchServiceUrl,
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

  // Block blacklisted Spotify artist IDs from polluting profiles
  if (dspUpdates.spotifyId && isBlacklistedSpotifyId(dspUpdates.spotifyId)) {
    logger.warn('MusicFetch enrichment: blocked blacklisted Spotify ID', {
      creatorProfileId,
      blockedSpotifyId: dspUpdates.spotifyId,
    });
    delete dspUpdates.spotifyId;
    delete dspUpdates.avatarUrl;
  }

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
  // Prefer URL-derived ID over a blacklisted stored ID so re-enrichment
  // with a corrected URL can recover the discography.
  const candidateId = extractSpotifyArtistId(spotifyUrl, existingSpotifyId);
  const spotifyId =
    candidateId && isBlacklistedSpotifyId(candidateId)
      ? extractSpotifyArtistId(spotifyUrl, null)
      : candidateId;
  if (!spotifyId) return;

  if (isBlacklistedSpotifyId(spotifyId)) {
    logger.warn(
      'MusicFetch enrichment: blocked discography import for blacklisted ID',
      { creatorProfileId, blockedSpotifyId: spotifyId }
    );
    return;
  }

  try {
    const importResult = await importReleasesFromSpotify(
      creatorProfileId,
      spotifyId,
      {
        discoverLinks: false,
      }
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

// ============================================================================
// DSP Presence Seeding
// ============================================================================

const streamingDspKeySet = new Set(STREAMING_DSP_KEYS);

/**
 * Upsert a single DSP artist match row, backfilling external ID via COALESCE
 * so ISRC-discovered matches retain their richer confidence data.
 */
async function upsertDspArtistMatch(
  creatorProfileId: string,
  providerId: string,
  externalArtistId: string | null,
  artistUrl: string,
  artistName: string | null,
  imageUrl: string | null,
  now: Date
): Promise<void> {
  await plainDb
    .insert(dspArtistMatches)
    .values({
      creatorProfileId,
      providerId,
      externalArtistId,
      externalArtistName: artistName,
      externalArtistUrl: artistUrl,
      externalArtistImageUrl: imageUrl,
      confidenceScore: null,
      confidenceBreakdown: null,
      matchingIsrcCount: 0,
      matchingUpcCount: 0,
      totalTracksChecked: 0,
      status: 'auto_confirmed',
      confirmedAt: now,
      matchSource: 'musicfetch',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dspArtistMatches.creatorProfileId, dspArtistMatches.providerId],
      set: {
        ...(externalArtistId
          ? {
              externalArtistId: drizzleSql`COALESCE(${dspArtistMatches.externalArtistId}, excluded.external_artist_id)`,
            }
          : {}),
        externalArtistUrl: artistUrl,
        externalArtistName: artistName,
        externalArtistImageUrl: imageUrl,
        updatedAt: now,
      },
      where: or(
        isNull(dspArtistMatches.matchSource),
        ne(dspArtistMatches.matchSource, 'manual')
      ),
    });
}

/**
 * Seed dspArtistMatches from MusicFetch discovery results.
 *
 * For each streaming DSP that MusicFetch resolved a URL for, upsert a row
 * into dspArtistMatches. Uses onConflictDoUpdate on URL/name/image fields, and
 * backfills missing external IDs when MusicFetch provides one, so
 * ISRC-discovered matches retain their richer confidence data.
 *
 * Runs outside the enrichment transaction (plainDb) so failures don't abort
 * the enrichment job — same pattern as the identity layer.
 */
async function seedPresenceFromMusicFetch(
  artistData: MusicFetchArtistResult,
  creatorProfileId: string,
  spotifyUrl: string
): Promise<number> {
  const now = new Date();
  let seeded = 0;
  const seededProviderIds = new Set<string>();
  const artistName = artistData.name ?? null;
  const imageUrl = artistData.image?.url ?? null;

  for (const [serviceKey, service] of Object.entries(artistData.services)) {
    const url = getMusicFetchServiceUrl(service);
    if (!url) continue;

    const dspEntry = MUSICFETCH_SERVICE_TO_DSP.get(serviceKey);
    if (!dspEntry) continue;

    // Only seed streaming DSPs (not video, metadata, or social)
    if (!streamingDspKeySet.has(dspEntry.key)) continue;

    // Spotify has a more reliable fallback path: derive the artist ID from the
    // known Spotify URL when MusicFetch omits it from the service payload.
    if (dspEntry.key === 'spotify' && !service.id) continue;

    if (seededProviderIds.has(dspEntry.key)) continue;

    try {
      await upsertDspArtistMatch(
        creatorProfileId,
        dspEntry.key,
        service.id ?? null,
        url,
        artistName,
        imageUrl,
        now
      );
      seeded++;
      seededProviderIds.add(dspEntry.key);
    } catch (error) {
      // Non-blocking — log and continue to next DSP
      logger.warn('MusicFetch presence seed: failed to upsert DSP match', {
        creatorProfileId,
        providerId: dspEntry.key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Also seed Spotify from the known URL
  if (spotifyUrl && !seededProviderIds.has('spotify')) {
    try {
      const spotifyId = extractSpotifyArtistId(spotifyUrl, null);
      await upsertDspArtistMatch(
        creatorProfileId,
        'spotify',
        spotifyId,
        spotifyUrl,
        artistName,
        imageUrl,
        now
      );
      seeded++;
    } catch (error) {
      logger.warn('MusicFetch presence seed: failed to upsert Spotify match', {
        creatorProfileId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (seeded > 0) {
    logger.info('MusicFetch enrichment: seeded DSP presence matches', {
      creatorProfileId,
      seeded,
    });
  }

  return seeded;
}

// ============================================================================
// Job Processor
// ============================================================================

/**
 * Handle errors from the MusicFetch API fetch call.
 *
 * Returns a result to short-circuit the job on permanent failures, or
 * re-throws for transient errors to trigger retry.
 */
async function handleMusicFetchApiError(
  tx: DbOrTransaction,
  error: unknown,
  creatorProfileId: string,
  spotifyUrl: string,
  result: MusicFetchEnrichmentResult
): Promise<MusicFetchEnrichmentResult> {
  if (error instanceof MusicfetchRequestError && error.statusCode === 400) {
    // InvalidServices = no services returned; still a retryable shape
    if (isMusicfetchInvalidServicesError(error)) {
      await setEnrichmentJobStatus(
        tx,
        creatorProfileId,
        'musicfetch',
        'failed'
      );
      throw error;
    }
    // All other 400s are permanent failures (bad URL, removed artist, etc.)
    logger.warn('MusicFetch enrichment: permanent failure (400)', {
      creatorProfileId,
      spotifyUrl,
    });
    result.errors.push(`MusicFetch API rejected request: ${error.message}`);
    await setEnrichmentJobStatus(tx, creatorProfileId, 'musicfetch', 'failed');
    return result;
  }
  // Transient errors (5xx, timeout, network) — re-throw to trigger retry
  await setEnrichmentJobStatus(tx, creatorProfileId, 'musicfetch', 'failed');
  throw error;
}

/**
 * Process a MusicFetch enrichment job.
 *
 * 1. Calls MusicFetch.io with the Spotify artist URL
 * 2. Maps DSP services to profile fields (only sets null fields)
 * 3. Creates social_links entries for Instagram, TikTok, etc.
 * 4. Updates bio if the profile has none
 * 5. Imports Spotify discography (releases, tracks, cross-platform links)
 * 6. Seeds dspArtistMatches for streaming DSP presence
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

  // Block enrichment for blacklisted Spotify artist URLs
  const urlArtistId = extractSpotifyArtistId(spotifyUrl, null);
  if (urlArtistId && isBlacklistedSpotifyId(urlArtistId)) {
    logger.warn('MusicFetch enrichment: blocked blacklisted Spotify URL', {
      creatorProfileId,
      blockedSpotifyId: urlArtistId,
      spotifyUrl,
    });
    result.errors.push(
      `Spotify artist ${urlArtistId} is blacklisted — skipping enrichment`
    );
    await setEnrichmentJobStatus(tx, creatorProfileId, 'musicfetch', 'failed');
    return result;
  }

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
    return handleMusicFetchApiError(
      tx,
      error,
      creatorProfileId,
      spotifyUrl,
      result
    );
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

  // Store ALL platform data in the identity layer (raw, multi-source).
  // Uses plainDb (not tx) so identity layer errors don't abort the
  // enrichment transaction — identity layer is additive, not critical.
  let publishResult = { inserted: 0, updated: 0 };
  try {
    const rawLinks = extractAllMusicFetchServices(artistData, spotifyUrl);
    const storedCount = await storeRawIdentityLinks(
      plainDb,
      creatorProfileId,
      'musicfetch',
      spotifyUrl,
      rawLinks
    );

    logger.info('MusicFetch enrichment: identity layer stored', {
      creatorProfileId,
      totalServicesReturned: Object.keys(artistData.services).length,
      servicesWithValidUrl: rawLinks.length,
      servicesStored: storedCount,
    });

    // Publish streaming links from identity layer to social_links
    publishResult = await publishIdentityLinks(plainDb, profile, {
      sourceFilter: 'musicfetch',
    });
  } catch (error) {
    // Identity layer is additive — don't fail the enrichment job
    logger.warn('MusicFetch enrichment: identity layer error (non-blocking)', {
      creatorProfileId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Apply DSP field updates to profile columns (backward compat)
  result.dspFieldsUpdated = await applyDspUpdates(
    tx,
    artistData,
    profile,
    spotifyUrl,
    creatorProfileId
  );

  // Also run legacy merge for backward compatibility (handles social links
  // that may not be in the identity layer yet, e.g. during migration)
  const linkResult = await mergeSocialLinks(
    tx,
    artistData,
    profile,
    spotifyUrl
  );
  // Identity layer publishes streaming DSPs only. Legacy path handles all links
  // but streaming ones already exist from identity layer (counted as updates, not inserts).
  // Sum is correct: identity inserts streaming + legacy inserts non-streaming.
  result.socialLinksInserted = publishResult.inserted + linkResult.inserted;
  result.socialLinksUpdated = publishResult.updated + linkResult.updated;
  await importDiscography(
    spotifyUrl,
    profile.spotifyId,
    creatorProfileId,
    result
  );

  // Seed dspArtistMatches for streaming DSP presence (non-blocking, outside tx)
  try {
    await seedPresenceFromMusicFetch(artistData, creatorProfileId, spotifyUrl);
  } catch (error) {
    // Non-blocking — presence seeding is additive, don't fail the job
    logger.warn(
      'MusicFetch enrichment: presence seeding error (non-blocking)',
      {
        creatorProfileId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    );
  }

  // Detect SoundCloud Pro badge (non-blocking, outside tx)
  const scSlug = profile.soundcloudId;
  if (scSlug) {
    try {
      await detectAndStoreSoundCloudProStatus(
        plainDb,
        creatorProfileId,
        scSlug
      );
    } catch (error) {
      logger.warn('SoundCloud Pro detection failed (non-blocking)', {
        creatorProfileId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

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
