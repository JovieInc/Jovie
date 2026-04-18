/**
 * Release Enrichment Job Processor
 *
 * After a DSP artist match is confirmed (manually or auto),
 * this job populates provider URLs for each release by:
 *
 * 1. UPC lookup  -- most reliable, directly maps release to album (Apple Music)
 * 2. ISRC lookup -- finds a track on the provider, derives album URL
 *
 * Uses existing provider link infrastructure (upsertProviderLink)
 * and respects manual overrides (won't overwrite source_type='manual').
 */

import 'server-only';

import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { type DbOrTransaction, db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  providerLinks,
} from '@/lib/db/schema/content';
import { logger } from '@/lib/utils/logger';
import {
  bulkLookupByIsrc,
  getAlbum,
  isAppleMusicAvailable,
  lookupByUpc,
  MAX_ISRC_BATCH_SIZE,
} from '../providers/apple-music';
import { bulkLookupDeezerByIsrc, isDeezerAvailable } from '../providers/deezer';
import type { DspTrackEnrichmentResult } from '../types';

// ============================================================================
// Payload Schema
// ============================================================================

export const releaseEnrichmentPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  matchId: z.string(),
  providerId: z.enum(['apple_music', 'deezer']),
  externalArtistId: z.string(),
});

// ============================================================================
// Constants
// ============================================================================

/** Maximum releases to process in a single job run */
const MAX_RELEASES_PER_RUN = 100;

/** Provider availability checks and display labels */
const PROVIDER_AVAILABILITY: Record<
  string,
  { check: () => boolean; label: string }
> = {
  apple_music: { check: isAppleMusicAvailable, label: 'Apple Music' },
  deezer: { check: isDeezerAvailable, label: 'Deezer' },
};

// ============================================================================
// Internal Types
// ============================================================================

interface LocalRelease {
  id: string;
  upc: string | null;
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetch releases for the profile that don't already have a link for the given provider.
 */
async function fetchUnlinkedReleases(
  dbConn: DbOrTransaction,
  creatorProfileId: string,
  providerId: string = 'apple_music'
): Promise<LocalRelease[]> {
  // Get all releases for this profile
  const releases = await dbConn
    .select({
      id: discogReleases.id,
      upc: discogReleases.upc,
    })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, creatorProfileId))
    .limit(MAX_RELEASES_PER_RUN);

  if (releases.length === 0) return [];

  const releaseIds = releases.map(r => r.id);

  // Find which releases already have a canonical link for this provider.
  // Search fallback URLs are NOT considered "linked" -- they should be upgraded
  // to canonical URLs when the release enrichment job discovers a real match.
  const existingLinks = await dbConn
    .select({
      releaseId: providerLinks.releaseId,
      metadata: providerLinks.metadata,
      sourceType: providerLinks.sourceType,
    })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.providerId, providerId),
        eq(providerLinks.ownerType, 'release'),
        inArray(providerLinks.releaseId, releaseIds)
      )
    );

  const linkedIds = new Set(
    existingLinks
      .filter(l => {
        // Manual overrides are always considered linked
        if (l.sourceType === 'manual') return true;
        // Search fallbacks should be upgraded -- don't count as linked
        const meta = l.metadata as Record<string, unknown> | null;
        if (meta?.discoveredFrom === 'search_fallback') return false;
        return true;
      })
      .map(l => l.releaseId)
  );

  return releases.filter(r => !linkedIds.has(r.id));
}

/**
 * Fetch one ISRC per release for ISRC-based matching.
 * Picks the first track (disc 1, track 1) with a non-null ISRC.
 */
async function fetchPrimaryIsrcsForReleases(
  dbConn: DbOrTransaction,
  releaseIds: string[]
): Promise<Map<string, string>> {
  if (releaseIds.length === 0) return new Map();

  const tracks = await dbConn
    .select({
      releaseId: discogReleaseTracks.releaseId,
      isrc: discogRecordings.isrc,
    })
    .from(discogReleaseTracks)
    .innerJoin(
      discogRecordings,
      eq(discogReleaseTracks.recordingId, discogRecordings.id)
    )
    .where(
      and(
        inArray(discogReleaseTracks.releaseId, releaseIds),
        drizzleSql`${discogRecordings.isrc} IS NOT NULL`
      )
    )
    .orderBy(discogReleaseTracks.discNumber, discogReleaseTracks.trackNumber);

  // Take the first ISRC per release
  const isrcByRelease = new Map<string, string>();
  for (const track of tracks) {
    if (track.isrc && !isrcByRelease.has(track.releaseId)) {
      isrcByRelease.set(track.releaseId, track.isrc);
    }
  }
  return isrcByRelease;
}

// ============================================================================
// Apple Music URL Extraction
// ============================================================================

/**
 * Derive the Apple Music album URL from a song URL.
 *
 * Apple Music song URLs come in two formats:
 *
 * 1. Album context (most common):
 *    https://music.apple.com/us/album/song-name/1234567890?i=1234567891
 *    -> Strip query string to get album URL
 *
 * 2. Direct song link:
 *    https://music.apple.com/us/song/song-name/1234567891
 *    -> Cannot derive album URL (return null, fall through to album relationship)
 */
function deriveAlbumUrlFromSongUrl(songUrl: string): string | null {
  try {
    const url = new URL(songUrl);
    // Only strip if the URL contains an album path
    if (url.pathname.includes('/album/')) {
      url.search = '';
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Shared ISRC Helpers
// ============================================================================

/**
 * Build a reverse map from uppercase ISRC -> releaseId for ISRC-based lookups.
 * Shared by both Apple Music and Deezer ISRC linking strategies.
 */
function buildIsrcToReleaseMap(
  releaseIds: string[],
  isrcByRelease: Map<string, string>
): Map<string, string> {
  const isrcToRelease = new Map<string, string>();
  for (const releaseId of releaseIds) {
    const isrc = isrcByRelease.get(releaseId);
    if (isrc) {
      isrcToRelease.set(isrc.toUpperCase(), releaseId);
    }
  }
  return isrcToRelease;
}

/** Merge entries from source into target. */
function mergeInto(
  target: Map<string, string>,
  source: Map<string, string>
): void {
  for (const [id, url] of source) {
    target.set(id, url);
  }
}

// ============================================================================
// Linking Strategies
// ============================================================================

/**
 * Strategy 1: Link releases via UPC lookup (Apple Music only).
 * Returns a map of releaseId -> Apple Music album URL.
 */
async function linkViaUpc(
  releases: LocalRelease[]
): Promise<Map<string, string>> {
  const linked = new Map<string, string>();
  const releasesWithUpc = releases.filter(r => r.upc);

  for (const release of releasesWithUpc) {
    try {
      const album = await lookupByUpc(release.upc!);
      if (album?.attributes?.url) {
        linked.set(release.id, album.attributes.url);
      }
    } catch (error) {
      logger.warn('UPC lookup failed for release', {
        releaseId: release.id,
        upc: release.upc,
        error,
      });
    }
  }

  return linked;
}

/**
 * Resolve an Apple Music album URL from a track result.
 *
 * Strategy order:
 * 2a. Derive album URL from song URL (works for /album/...?i= format)
 * 2b. Fetch album directly via relationship data (works for /song/ format
 *     when include=albums was requested in the ISRC lookup)
 */
async function resolveAlbumUrl(track: {
  attributes?: { url?: string };
  relationships?: { albums?: { data?: { id: string }[] } };
}): Promise<string | null> {
  // Strategy 2a: Derive album URL from song URL (handles /album/...?i= format)
  if (track.attributes?.url) {
    const albumUrl = deriveAlbumUrlFromSongUrl(track.attributes.url);
    if (albumUrl) return albumUrl;
  }

  // Strategy 2b: Fetch album directly if we have an album relationship
  // This handles /song/ URLs where we can't derive the album URL from the path.
  // Requires include=albums in the ISRC lookup request.
  const albumId = track.relationships?.albums?.data?.[0]?.id;
  if (albumId) {
    try {
      const album = await getAlbum(albumId);
      if (album?.attributes?.url) return album.attributes.url;
    } catch {
      // Fall through to log warning
    }
  }

  logger.warn('Could not resolve album URL from track', {
    songUrl: track.attributes?.url,
    hasAlbumRelationship: !!track.relationships?.albums?.data?.length,
  });

  return null;
}

/**
 * Strategy 2: Link releases via ISRC -> track -> album URL (Apple Music).
 * Batches ISRC lookups for efficiency (25 per API request).
 */
async function linkViaAppleMusicIsrc(
  releaseIds: string[],
  isrcByRelease: Map<string, string>
): Promise<Map<string, string>> {
  const linked = new Map<string, string>();
  const isrcToRelease = buildIsrcToReleaseMap(releaseIds, isrcByRelease);

  if (isrcToRelease.size === 0) return linked;

  const allIsrcs = Array.from(isrcToRelease.keys());

  // Process in batches of 25
  for (let i = 0; i < allIsrcs.length; i += MAX_ISRC_BATCH_SIZE) {
    const batch = allIsrcs.slice(i, i + MAX_ISRC_BATCH_SIZE);

    try {
      const trackMap = await bulkLookupByIsrc(batch);

      for (const [isrc, track] of trackMap) {
        const releaseId = isrcToRelease.get(isrc);
        if (!releaseId || linked.has(releaseId)) continue;

        const albumUrl = await resolveAlbumUrl(track);
        if (albumUrl) {
          linked.set(releaseId, albumUrl);
        }
      }
    } catch (error) {
      logger.warn('ISRC batch lookup failed', {
        batchStart: i,
        batchSize: batch.length,
        error,
      });
    }
  }

  return linked;
}

/**
 * Link releases to Deezer via ISRC lookups.
 * Deezer doesn't support UPC lookups, so we only use ISRC matching.
 */
async function linkViaDeezerIsrc(
  releaseIds: string[],
  isrcByRelease: Map<string, string>
): Promise<Map<string, string>> {
  const linked = new Map<string, string>();
  const isrcToRelease = buildIsrcToReleaseMap(releaseIds, isrcByRelease);

  if (isrcToRelease.size === 0) return linked;

  const allIsrcs = Array.from(isrcToRelease.keys());

  try {
    const trackMap = await bulkLookupDeezerByIsrc(allIsrcs);

    for (const [isrc, track] of trackMap) {
      const releaseId = isrcToRelease.get(isrc);
      if (!releaseId || linked.has(releaseId)) continue;

      const url = track.album?.link ?? track.link;
      if (url) {
        linked.set(releaseId, url);
      }
    }
  } catch (error) {
    logger.warn('Deezer ISRC batch lookup failed', {
      isrcCount: allIsrcs.length,
      error,
    });
  }

  return linked;
}

// ============================================================================
// Provider Link Persistence
// ============================================================================

/**
 * Save provider URLs as provider links for releases.
 * Skips releases that already have manual overrides.
 */
async function saveProviderLinks(
  dbConn: DbOrTransaction,
  linkedReleases: Map<string, string>,
  providerId: string = 'apple_music'
): Promise<number> {
  let saved = 0;

  for (const [releaseId, url] of linkedReleases) {
    try {
      const now = new Date();
      await dbConn
        .insert(providerLinks)
        .values({
          providerId,
          ownerType: 'release',
          releaseId,
          trackId: null,
          url,
          externalId: null,
          sourceType: 'ingested',
          isPrimary: false,
          metadata: {},
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [providerLinks.providerId, providerLinks.releaseId],
          set: {
            url,
            updatedAt: now,
          },
          // Only update if not manually overridden
          setWhere: drizzleSql`${providerLinks.sourceType} != 'manual'`,
        });
      saved++;
    } catch (error) {
      logger.warn(`Failed to save ${providerId} provider link`, {
        releaseId,
        url,
        error,
      });
    }
  }

  return saved;
}

// ============================================================================
// Provider-Specific Enrichment
// ============================================================================

/**
 * Run Apple Music enrichment: UPC lookup first, then ISRC fallback.
 */
async function enrichAppleMusic(
  dbConn: DbOrTransaction,
  unlinkedReleases: LocalRelease[]
): Promise<Map<string, string>> {
  const allLinked = new Map<string, string>();

  // UPC lookup (most reliable)
  mergeInto(allLinked, await linkViaUpc(unlinkedReleases));

  // ISRC fallback for remaining unlinked releases
  const stillUnlinked = unlinkedReleases
    .filter(r => !allLinked.has(r.id))
    .map(r => r.id);

  if (stillUnlinked.length > 0) {
    const isrcByRelease = await fetchPrimaryIsrcsForReleases(
      dbConn,
      stillUnlinked
    );
    mergeInto(
      allLinked,
      await linkViaAppleMusicIsrc(stillUnlinked, isrcByRelease)
    );
  }

  return allLinked;
}

/**
 * Run Deezer enrichment: ISRC lookup only (no UPC support).
 */
async function enrichDeezer(
  dbConn: DbOrTransaction,
  unlinkedReleases: LocalRelease[]
): Promise<Map<string, string>> {
  const releaseIds = unlinkedReleases.map(r => r.id);
  const isrcByRelease = await fetchPrimaryIsrcsForReleases(dbConn, releaseIds);
  return linkViaDeezerIsrc(releaseIds, isrcByRelease);
}

// ============================================================================
// Job Processor
// ============================================================================

/**
 * Process a release enrichment job.
 *
 * Finds provider URLs for all unlinked releases in a creator's profile
 * using UPC and ISRC-based matching strategies.
 */
export async function processReleaseEnrichmentJob(
  dbConn: DbOrTransaction,
  jobPayload: unknown
): Promise<DspTrackEnrichmentResult> {
  const payload = releaseEnrichmentPayloadSchema.parse(jobPayload);
  const { creatorProfileId, providerId } = payload;

  const result: DspTrackEnrichmentResult = {
    creatorProfileId,
    providerId,
    tracksEnriched: 0,
    releasesEnriched: 0,
    errors: [],
  };

  // Check provider availability
  const config = PROVIDER_AVAILABILITY[providerId];
  if (config && !config.check()) {
    result.errors.push(`${config.label} provider not available`);
    return result;
  }

  // 1. Fetch releases that need linking for this provider
  const unlinkedReleases = await fetchUnlinkedReleases(
    dbConn,
    creatorProfileId,
    providerId
  );

  if (unlinkedReleases.length === 0) {
    return result; // Nothing to do
  }

  // 2. Run provider-specific enrichment strategy
  const enrichFn = providerId === 'deezer' ? enrichDeezer : enrichAppleMusic;
  const allLinked = await enrichFn(dbConn, unlinkedReleases);

  // 3. Save all discovered links
  if (allLinked.size > 0) {
    const saved = await saveProviderLinks(dbConn, allLinked, providerId);
    result.releasesEnriched = saved;
  }

  logger.info('Release enrichment completed', {
    creatorProfileId,
    providerId,
    totalReleases: unlinkedReleases.length,
    totalLinked: allLinked.size,
  });

  return result;
}

/**
 * Process release enrichment with standalone database operations.
 * Used when called from API routes (neon-http doesn't support transactions).
 */
export async function processReleaseEnrichmentJobStandalone(
  jobPayload: unknown
): Promise<DspTrackEnrichmentResult> {
  return processReleaseEnrichmentJob(db, jobPayload);
}
