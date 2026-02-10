/**
 * Release Enrichment Job Processor
 *
 * After an Apple Music artist match is confirmed (manually or auto),
 * this job populates Apple Music URLs for each release by:
 *
 * 1. UPC lookup  – most reliable, directly maps release to album
 * 2. ISRC lookup – finds a track on Apple Music, derives album URL
 *
 * Uses existing provider link infrastructure (upsertProviderLink)
 * and respects manual overrides (won't overwrite source_type='manual').
 */

import 'server-only';

import { and, eq, inArray, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';

import { type DbOrTransaction, db } from '@/lib/db';
import { discogReleases, discogTracks, providerLinks } from '@/lib/db/schema/content';
import { logger } from '@/lib/utils/logger';

import type { DspTrackEnrichmentResult } from '../types';
import {
  bulkLookupByIsrc,
  getAlbum,
  isAppleMusicAvailable,
  lookupByUpc,
  MAX_ISRC_BATCH_SIZE,
} from '../providers/apple-music';

// ============================================================================
// Payload Schema
// ============================================================================

export const releaseEnrichmentPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  matchId: z.string(),
  providerId: z.literal('apple_music'),
  externalArtistId: z.string(),
});

// ============================================================================
// Constants
// ============================================================================

/** Maximum releases to process in a single job run */
const MAX_RELEASES_PER_RUN = 100;

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
 * Fetch releases for the profile that don't already have an Apple Music link.
 */
async function fetchUnlinkedReleases(
  dbConn: DbOrTransaction,
  creatorProfileId: string
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

  // Find which releases already have an Apple Music link (any source type)
  const existingLinks = await dbConn
    .select({ releaseId: providerLinks.releaseId })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.providerId, 'apple_music'),
        eq(providerLinks.ownerType, 'release'),
        inArray(providerLinks.releaseId, releaseIds)
      )
    );

  const linkedIds = new Set(existingLinks.map(l => l.releaseId));

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
      releaseId: discogTracks.releaseId,
      isrc: discogTracks.isrc,
    })
    .from(discogTracks)
    .where(
      and(
        inArray(discogTracks.releaseId, releaseIds),
        drizzleSql`${discogTracks.isrc} IS NOT NULL`
      )
    )
    .orderBy(discogTracks.discNumber, discogTracks.trackNumber);

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
 * Apple Music song URLs typically look like:
 *   https://music.apple.com/us/album/song-name/1234567890?i=1234567891
 *
 * Stripping the query string gives the album URL.
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
// Linking Strategies
// ============================================================================

/**
 * Strategy 1: Link releases via UPC lookup.
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
 * Strategy 2: Link releases via ISRC -> track -> album URL.
 * Batches ISRC lookups for efficiency (25 per API request).
 */
async function linkViaIsrc(
  releaseIds: string[],
  isrcByRelease: Map<string, string>
): Promise<Map<string, string>> {
  const linked = new Map<string, string>();

  // Collect ISRCs to look up, tracking which release each belongs to
  const isrcToRelease = new Map<string, string>();
  for (const releaseId of releaseIds) {
    const isrc = isrcByRelease.get(releaseId);
    if (isrc) {
      isrcToRelease.set(isrc.toUpperCase(), releaseId);
    }
  }

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

        // Strategy 2a: Derive album URL from song URL
        if (track.attributes?.url) {
          const albumUrl = deriveAlbumUrlFromSongUrl(track.attributes.url);
          if (albumUrl) {
            linked.set(releaseId, albumUrl);
            continue;
          }
        }

        // Strategy 2b: Fetch album directly if we have an album relationship
        const albumId = track.relationships?.albums?.data?.[0]?.id;
        if (albumId) {
          try {
            const album = await getAlbum(albumId);
            if (album?.attributes?.url) {
              linked.set(releaseId, album.attributes.url);
            }
          } catch {
            // Album fetch failed, skip this release
          }
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

// ============================================================================
// Provider Link Persistence
// ============================================================================

/**
 * Save Apple Music URLs as provider links for releases.
 * Skips releases that already have manual overrides.
 */
async function saveProviderLinks(
  dbConn: DbOrTransaction,
  linkedReleases: Map<string, string>
): Promise<number> {
  let saved = 0;

  for (const [releaseId, url] of linkedReleases) {
    try {
      const now = new Date();
      await dbConn
        .insert(providerLinks)
        .values({
          providerId: 'apple_music',
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
      logger.warn('Failed to save Apple Music provider link', {
        releaseId,
        url,
        error,
      });
    }
  }

  return saved;
}

// ============================================================================
// Job Processor
// ============================================================================

/**
 * Process a release enrichment job.
 *
 * Finds Apple Music URLs for all unlinked releases in a creator's profile
 * using UPC and ISRC-based matching.
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

  if (!isAppleMusicAvailable()) {
    result.errors.push('Apple Music provider not available');
    return result;
  }

  // 1. Fetch releases that need linking
  const unlinkedReleases = await fetchUnlinkedReleases(dbConn, creatorProfileId);

  if (unlinkedReleases.length === 0) {
    return result; // Nothing to do
  }

  const allLinked = new Map<string, string>();

  // 2. Strategy 1: UPC lookup (most reliable)
  const upcLinked = await linkViaUpc(unlinkedReleases);
  for (const [id, url] of upcLinked) {
    allLinked.set(id, url);
  }

  // 3. Strategy 2: ISRC lookup (for remaining unlinked releases)
  const stillUnlinked = unlinkedReleases
    .filter(r => !allLinked.has(r.id))
    .map(r => r.id);

  if (stillUnlinked.length > 0) {
    const isrcByRelease = await fetchPrimaryIsrcsForReleases(
      dbConn,
      stillUnlinked
    );
    const isrcLinked = await linkViaIsrc(stillUnlinked, isrcByRelease);
    for (const [id, url] of isrcLinked) {
      allLinked.set(id, url);
    }
  }

  // 4. Save all discovered links
  if (allLinked.size > 0) {
    const saved = await saveProviderLinks(dbConn, allLinked);
    result.releasesEnriched = saved;
  }

  logger.info('Release enrichment completed', {
    creatorProfileId,
    totalReleases: unlinkedReleases.length,
    upcMatched: upcLinked.size,
    isrcMatched: allLinked.size - upcLinked.size,
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
