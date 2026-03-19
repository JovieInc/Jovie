import * as Sentry from '@sentry/nextjs';
import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases, discogTracks } from '@/lib/db/schema/content';
import { captureError, captureWarning } from '@/lib/error-tracking';
import {
  buildSpotifyAlbumUrl,
  buildSpotifyTrackUrl,
  getBestSpotifyImage,
  getSpotifyAlbums,
  getSpotifyArtistAlbums,
  getSpotifyTracks,
  parseSpotifyReleaseDate,
  type SpotifyAlbum,
  type SpotifyAlbumFull,
  type SpotifyTrackFull,
} from '@/lib/spotify';
import {
  sanitizeImageUrl,
  sanitizeName,
  sanitizeText,
} from '@/lib/spotify/sanitize';
import { spotifyArtistIdSchema } from '@/lib/validation/schemas/spotify';

import {
  parseArtistCredits,
  parseMainArtists,
  type SpotifyArtistInput,
} from './artist-parser';
import {
  processReleaseArtistCredits,
  processTrackArtistCredits,
} from './artist-queries';
import { discoverLinksForRelease } from './discovery';
import {
  getReleasesForProfile,
  type ReleaseWithProviders,
  upsertProviderLink,
  upsertRelease,
  upsertTrack,
} from './queries';
import { classifySpotifyReleaseType } from './release-type';
import { generateUniqueSlug } from './slug';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of releases to import in a single operation */
const MAX_RELEASES_PER_IMPORT = 200;

/** Maximum number of tracks per release */
const MAX_TRACKS_PER_RELEASE = 100;

const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

function sanitizeBoundedInteger(
  value: number | null | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(Math.trunc(value), max));
}

function sanitizeBoundedNullableInteger(
  value: number | null | undefined,
  min: number,
  max: number
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(min, Math.min(Math.trunc(value), max));
}

export interface SpotifyImportResult {
  success: boolean;
  imported: number;
  updated: number;
  failed: number;
  total: number;
  releases: ReleaseWithProviders[];
  errors: string[];
}

export interface SpotifyImportOptions {
  /** Include album types. Defaults to ['album', 'single', 'compilation'] */
  includeGroups?: ('album' | 'single' | 'compilation' | 'appears_on')[];
  /** Import tracks for each release. Defaults to true to enable ISRC discovery */
  includeTracks?: boolean;
  /** Market for availability. Defaults to 'US' */
  market?: string;
  /** Discover cross-platform links after import. Defaults to true */
  discoverLinks?: boolean;
}

/**
 * Discover cross-platform links for imported releases
 */
async function discoverLinksForReleases(
  creatorProfileId: string,
  market: string
): Promise<void> {
  const importedReleases = await getReleasesForProfile(creatorProfileId);

  for (const release of importedReleases) {
    try {
      // Only count canonical/manual links as existing — search fallback URLs
      // should be upgraded to canonical links via ISRC/UPC discovery.
      const existingProviders = release.providerLinks
        .filter(l => {
          const meta = l.metadata as Record<string, unknown> | null;
          return meta?.discoveredFrom !== 'search_fallback';
        })
        .map(l => l.providerId);
      await discoverLinksForRelease(release.id, existingProviders, {
        skipExisting: true,
        storefront: market.toLowerCase(),
      });
    } catch (error) {
      // Don't fail the whole import if discovery fails
      Sentry.addBreadcrumb({
        category: 'spotify-import',
        message: `Discovery failed for ${release.title}`,
        level: 'debug',
        data: { releaseId: release.id, error },
      });
    }
  }
}

/**
 * Import a batch of albums and track results
 */
async function importAlbumBatch(
  creatorProfileId: string,
  albumsToImport: SpotifyAlbum[],
  fullAlbumMap: Map<string, SpotifyAlbumFull>,
  result: SpotifyImportResult
): Promise<void> {
  for (const album of albumsToImport) {
    try {
      const fullAlbum = fullAlbumMap.get(album.id);
      await importSingleRelease(creatorProfileId, album, fullAlbum);
      result.imported++;
    } catch (error) {
      result.failed++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      const sanitizedAlbumName = sanitizeName(album.name);
      result.errors.push(
        `Failed to import "${sanitizedAlbumName}": ${message}`
      );

      captureError(`Failed to import album ${album.id}`, error, {
        source: 'spotify_import',
        albumId: album.id,
        albumName: sanitizedAlbumName,
        creatorProfileId,
      });
    }
  }
}

function mergeFullTrackMetadata(
  album: SpotifyAlbumFull,
  fullTracksById: Map<string, SpotifyTrackFull>
): SpotifyAlbumFull {
  return {
    ...album,
    tracks: {
      ...album.tracks,
      items: album.tracks.items.map(track => {
        const fullTrack = fullTracksById.get(track.id);
        if (!fullTrack) return track;

        return {
          ...track,
          external_ids: fullTrack.external_ids,
        };
      }),
    },
  };
}

function normalizeSpotifyIsrc(isrc: string | undefined): string | null {
  if (!isrc) return null;

  const normalized = isrc.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!ISRC_REGEX.test(normalized)) return null;

  return normalized;
}

function logTrackIsrcCoverage(album: SpotifyAlbumFull): void {
  const tracks = album.tracks.items;
  if (tracks.length === 0) return;

  const tracksWithIsrc = tracks.filter(
    track => normalizeSpotifyIsrc(track.external_ids?.isrc) !== null
  ).length;

  if (tracksWithIsrc !== tracks.length) {
    captureWarning('Spotify ISRC coverage is incomplete for album tracks', {
      source: 'spotify_import',
      albumId: album.id,
      albumName: sanitizeName(album.name),
      totalTracks: tracks.length,
      tracksWithIsrc,
      tracksMissingIsrc: tracks.length - tracksWithIsrc,
      coverageRatio: Number((tracksWithIsrc / tracks.length).toFixed(3)),
    });
  }
}

/**
 * Import all releases from a Spotify artist profile into the database
 *
 * Security:
 * - Validates Spotify artist ID format
 * - Sanitizes all imported data
 * - Limits number of releases per import
 * - Tracks errors with Sentry
 */
export async function importReleasesFromSpotify(
  creatorProfileId: string,
  spotifyArtistId: string,
  options: SpotifyImportOptions = {}
): Promise<SpotifyImportResult> {
  const {
    includeGroups = ['album', 'single', 'compilation'],
    includeTracks = true, // Default to true for ISRC discovery
    discoverLinks = true,
    market = 'US',
  } = options;

  const result: SpotifyImportResult = {
    success: false,
    imported: 0,
    updated: 0,
    failed: 0,
    total: 0,
    releases: [],
    errors: [],
  };

  // Validate Spotify artist ID before making any API calls
  const idValidation = spotifyArtistIdSchema.safeParse(spotifyArtistId);
  if (!idValidation.success) {
    result.errors.push('Invalid Spotify artist ID format');
    Sentry.captureMessage('Invalid Spotify artist ID in import', {
      level: 'warning',
      extra: { spotifyArtistId, creatorProfileId },
    });
    return result;
  }

  // Validate creator profile ID
  if (!creatorProfileId || typeof creatorProfileId !== 'string') {
    result.errors.push('Invalid creator profile ID');
    return result;
  }

  return Sentry.startSpan(
    { op: 'spotify.import', name: 'Import releases from Spotify' },
    async span => {
      span.setAttribute('spotify.artist_id', spotifyArtistId);
      span.setAttribute('creator_profile_id', creatorProfileId);

      try {
        // 1. Fetch all albums from Spotify
        const { albums: spotifyAlbums, total: spotifyTotal } =
          await getSpotifyArtistAlbums(spotifyArtistId, {
            includeGroups,
            market,
          });

        if (spotifyAlbums.length === 0) {
          result.success = true;
          result.releases = await getReleasesForProfile(creatorProfileId);
          return result;
        }

        // Safety limit: cap number of releases
        const albumsToImport = spotifyAlbums.slice(0, MAX_RELEASES_PER_IMPORT);
        result.total = Math.min(spotifyTotal, MAX_RELEASES_PER_IMPORT);
        if (spotifyAlbums.length > MAX_RELEASES_PER_IMPORT) {
          captureWarning('Spotify import truncated due to limit', {
            totalReleases: spotifyAlbums.length,
            limit: MAX_RELEASES_PER_IMPORT,
            spotifyArtistId,
          });
        }

        span.setAttribute('spotify.album_count', albumsToImport.length);

        // Early-write total to settings so polling can show determinate progress
        try {
          const { creatorProfiles } = await import('@/lib/db/schema');
          const [current] = await db
            .select({ settings: creatorProfiles.settings })
            .from(creatorProfiles)
            .where(eq(creatorProfiles.id, creatorProfileId))
            .limit(1);
          const currentSettings = (current?.settings ?? {}) as Record<
            string,
            unknown
          >;
          await db
            .update(creatorProfiles)
            .set({
              settings: {
                ...currentSettings,
                spotifyImportTotal: result.total,
              },
            })
            .where(eq(creatorProfiles.id, creatorProfileId));
        } catch {
          // Non-critical: progress bar falls back to shimmer if this fails
        }

        // 2. Get full album details (includes tracks and UPC)
        const albumIds = albumsToImport.map(a => a.id);
        const fullAlbums = includeTracks
          ? await getSpotifyAlbums(albumIds, market)
          : [];

        const spotifyTrackIds = fullAlbums.flatMap(album =>
          album.tracks.items.map(track => track.id)
        );
        const fullTracks = includeTracks
          ? await getSpotifyTracks(spotifyTrackIds, market)
          : [];
        const fullTracksById = new Map<string, SpotifyTrackFull>(
          fullTracks.map(track => [track.id, track])
        );

        // Create a map for quick lookup
        const fullAlbumMap = new Map<string, SpotifyAlbumFull>();
        for (const album of fullAlbums) {
          const enrichedAlbum = mergeFullTrackMetadata(album, fullTracksById);
          logTrackIsrcCoverage(enrichedAlbum);
          fullAlbumMap.set(album.id, enrichedAlbum);
        }

        // 3. Import each album
        await importAlbumBatch(
          creatorProfileId,
          albumsToImport,
          fullAlbumMap,
          result
        );

        // 4. Discover cross-platform links
        if (discoverLinks && includeTracks) {
          await discoverLinksForReleases(creatorProfileId, market);
        }

        // 5. Fetch the final state
        result.releases = await getReleasesForProfile(creatorProfileId);
        result.success = result.failed === 0;

        span.setAttribute('spotify.imported_count', result.imported);
        span.setAttribute('spotify.failed_count', result.failed);

        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Import failed: ${message}`);

        captureError('Spotify import failed', error, {
          source: 'spotify_import',
          spotifyArtistId,
          creatorProfileId,
        });

        return result;
      }
    }
  );
}

/**
 * Sanitize album metadata fields
 */
function sanitizeAlbumMetadata(
  album: SpotifyAlbum,
  fullAlbum?: SpotifyAlbumFull
) {
  const sanitizedTitle = sanitizeName(album.name);
  const preferredImages =
    fullAlbum?.images && fullAlbum.images.length > 0
      ? fullAlbum.images
      : album.images;
  const rawArtworkUrl = getBestSpotifyImage(preferredImages);
  const artworkUrl = rawArtworkUrl ? sanitizeImageUrl(rawArtworkUrl) : null;
  const sanitizedLabel = fullAlbum?.label
    ? sanitizeText(fullAlbum.label, 200)
    : null;
  const sanitizedUpc = fullAlbum?.external_ids?.upc
    ? fullAlbum.external_ids.upc.replaceAll(/[^a-zA-Z0-9]/g, '').slice(0, 20)
    : null;

  // Get popularity from full album (more reliable) or basic album
  const rawPopularity = fullAlbum?.popularity ?? album.popularity;
  const popularity =
    typeof rawPopularity === 'number' && Number.isFinite(rawPopularity)
      ? Math.min(100, Math.max(0, Math.round(rawPopularity)))
      : null;

  // Extract genres from full album (Spotify returns genres on album objects)
  const genres =
    fullAlbum?.genres && fullAlbum.genres.length > 0
      ? fullAlbum.genres.slice(0, 10).map(g => sanitizeText(g, 100))
      : null;

  // Extract copyright line (℗ = phonographic copyright, type 'P')
  const pCopyright = fullAlbum?.copyrights?.find(c => c.type === 'P');
  const copyrightLine = pCopyright?.text
    ? sanitizeText(pCopyright.text, 500)
    : null;

  // Extract distributor from © copyright (type 'C')
  const cCopyright = fullAlbum?.copyrights?.find(c => c.type === 'C');
  const distributor = cCopyright?.text
    ? sanitizeText(cCopyright.text, 500)
    : null;

  return {
    sanitizedTitle,
    artworkUrl,
    sanitizedLabel,
    sanitizedUpc,
    popularity,
    genres,
    copyrightLine,
    distributor,
  };
}

/**
 * Parse and sanitize artist credits from album
 */
function parseAlbumArtistInputs(
  album: SpotifyAlbum,
  fullAlbum?: SpotifyAlbumFull
): SpotifyArtistInput[] {
  return album.artists.map(a => ({
    id: a.id,
    name: sanitizeName(a.name),
    images: fullAlbum?.images,
  }));
}

/**
 * Fetch existing track slugs to preserve them across re-imports
 */
async function fetchExistingTrackSlugs(
  creatorProfileId: string,
  spotifyTrackIds: string[]
): Promise<Map<string, { id: string; slug: string }>> {
  const existingTracksBySpotifyId = new Map<
    string,
    { id: string; slug: string }
  >();

  if (spotifyTrackIds.length === 0) {
    return existingTracksBySpotifyId;
  }

  const rows = await db
    .select({
      id: discogTracks.id,
      slug: discogTracks.slug,
      spotifyTrackId:
        drizzleSql<string>`${discogTracks.metadata} ->> 'spotifyId'`.as(
          'spotify_track_id'
        ),
    })
    .from(discogTracks)
    .where(
      and(
        eq(discogTracks.creatorProfileId, creatorProfileId),
        inArray(
          drizzleSql<string>`${discogTracks.metadata} ->> 'spotifyId'`,
          spotifyTrackIds
        )
      )
    );

  for (const row of rows) {
    if (!row.spotifyTrackId) continue;
    existingTracksBySpotifyId.set(row.spotifyTrackId, {
      id: row.id,
      slug: row.slug,
    });
  }

  return existingTracksBySpotifyId;
}

/**
 * Process tracks for a release
 */
async function processTracksForRelease(
  release: { id: string },
  creatorProfileId: string,
  sanitizedTitle: string,
  slug: string,
  fullAlbum: SpotifyAlbumFull
): Promise<boolean> {
  const tracksToImport = fullAlbum.tracks.items.slice(
    0,
    MAX_TRACKS_PER_RELEASE
  );
  const spotifyTrackIds = tracksToImport.map(t => t.id).filter(Boolean);
  const existingTracksBySpotifyId = await fetchExistingTrackSlugs(
    creatorProfileId,
    spotifyTrackIds
  );

  let hasExplicit = false;

  for (const track of tracksToImport) {
    if (track.explicit) {
      hasExplicit = true;
    }

    const sanitizedTrackTitle = sanitizeName(track.name);
    const existingTrack = track.id
      ? existingTracksBySpotifyId.get(track.id)
      : undefined;
    const trackSlug =
      existingTrack?.slug ??
      (await generateUniqueSlug(
        creatorProfileId,
        sanitizedTrackTitle,
        'track',
        existingTrack?.id
      ));

    const sanitizedIsrc = normalizeSpotifyIsrc(track.external_ids?.isrc);

    const sanitizedPreviewUrl = track.preview_url
      ? sanitizeSpotifyPreviewUrl(track.preview_url)
      : null;
    const audioFallbackUrl = sanitizedPreviewUrl;
    const audioFallbackFormat = audioFallbackUrl ? 'mp3' : null;

    const createdTrack = await upsertTrack({
      releaseId: release.id,
      creatorProfileId,
      title: sanitizedTrackTitle,
      slug: trackSlug,
      trackNumber: sanitizeBoundedInteger(track.track_number, 1, 999, 1),
      discNumber: sanitizeBoundedInteger(track.disc_number, 1, 99, 1),
      durationMs: sanitizeBoundedNullableInteger(
        track.duration_ms,
        0,
        60 * 60 * 1000
      ),
      isExplicit: track.explicit,
      isrc: sanitizedIsrc,
      previewUrl: sanitizedPreviewUrl,
      audioUrl: audioFallbackUrl,
      audioFormat: audioFallbackFormat,
      sourceType: 'ingested',
      metadata: {
        spotifyId: track.id,
        spotifyUri: track.uri,
      },
    });

    await upsertProviderLink({
      trackId: createdTrack.id,
      providerId: 'spotify',
      url: buildSpotifyTrackUrl(track.id),
      externalId: null,
      sourceType: 'ingested',
      isPrimary: true,
      metadata: {
        providerExternalId: track.id,
        isrc: sanitizedIsrc,
      },
    });

    const trackArtistInputs: SpotifyArtistInput[] = track.artists.map(a => ({
      id: a.id,
      name: sanitizeName(a.name),
    }));

    const trackArtistCredits = parseArtistCredits(
      track.name,
      trackArtistInputs
    );
    await processTrackArtistCredits(createdTrack.id, trackArtistCredits, {
      deleteExisting: true,
      sourceType: 'ingested',
    });
  }

  // Update release explicit flag if any track is explicit
  if (hasExplicit) {
    await upsertRelease({
      creatorProfileId,
      title: sanitizedTitle,
      slug,
      isExplicit: true,
    });
  }

  return hasExplicit;
}

/**
 * Import a single release from Spotify data
 *
 * Security:
 * - Sanitizes all text fields (title, label, artist names)
 * - Validates and sanitizes image URLs
 * - Limits track count per release
 */
async function importSingleRelease(
  creatorProfileId: string,
  album: SpotifyAlbum,
  fullAlbum?: SpotifyAlbumFull
): Promise<void> {
  const metadata = sanitizeAlbumMetadata(album, fullAlbum);

  // If this album was previously imported for this creator, preserve its slug
  // for stability even when provider_links cannot store a duplicate
  // external_id under the current global unique index.
  const [existingRelease] = await db
    .select({
      id: discogReleases.id,
      slug: discogReleases.slug,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        drizzleSql`${discogReleases.metadata} ->> 'spotifyId' = ${album.id}`
      )
    )
    .limit(1);

  const slug =
    existingRelease?.slug ??
    (await generateUniqueSlug(
      creatorProfileId,
      metadata.sanitizedTitle,
      'release',
      existingRelease?.id
    ));

  const effectiveAlbumType = fullAlbum?.album_type ?? album.album_type;
  const effectiveTotalTracks = fullAlbum?.total_tracks ?? album.total_tracks;

  const releaseType = classifySpotifyReleaseType(
    effectiveAlbumType,
    effectiveTotalTracks
  );
  const releaseDate = parseSpotifyReleaseDate(
    fullAlbum?.release_date ?? album.release_date,
    fullAlbum?.release_date_precision ?? album.release_date_precision
  );

  // Upsert the release with sanitized data
  const release = await upsertRelease({
    creatorProfileId,
    title: metadata.sanitizedTitle,
    slug,
    releaseType,
    releaseDate,
    label: metadata.sanitizedLabel,
    upc: metadata.sanitizedUpc,
    totalTracks: Math.min(effectiveTotalTracks, MAX_TRACKS_PER_RELEASE),
    isExplicit: false,
    genres: metadata.genres,
    copyrightLine: metadata.copyrightLine,
    distributor: metadata.distributor,
    artworkUrl: metadata.artworkUrl,
    spotifyPopularity: metadata.popularity,
    sourceType: 'ingested',
    metadata: {
      spotifyId: album.id,
      spotifyUri: album.uri,
      spotifyArtists: album.artists.map(a => ({
        id: a.id,
        name: sanitizeName(a.name),
      })),
      importedAt: new Date().toISOString(),
    },
  });

  // Create Spotify provider link
  await upsertProviderLink({
    releaseId: release.id,
    providerId: 'spotify',
    url: buildSpotifyAlbumUrl(album.id),
    externalId: null,
    sourceType: 'ingested',
    isPrimary: true,
    metadata: {
      providerExternalId: album.id,
    },
  });

  // Process release-level artist credits
  const releaseArtistInputs = parseAlbumArtistInputs(album, fullAlbum);
  const releaseArtistCredits = parseMainArtists(releaseArtistInputs);
  await processReleaseArtistCredits(release.id, releaseArtistCredits, {
    deleteExisting: true,
    sourceType: 'ingested',
  });

  // Import tracks if we have full album data
  if (fullAlbum?.tracks?.items) {
    await processTracksForRelease(
      release,
      creatorProfileId,
      metadata.sanitizedTitle,
      slug,
      fullAlbum
    );
  }
}

/**
 * Sanitize a Spotify preview URL
 * Only allows URLs from Spotify CDN domains
 */
function sanitizeSpotifyPreviewUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Only allow Spotify CDN domains for preview URLs
    if (
      parsed.hostname.endsWith('.scdn.co') ||
      parsed.hostname.endsWith('.spotifycdn.com')
    ) {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the Spotify artist ID from a creator profile
 * Returns null if not connected
 */
export async function getSpotifyArtistIdForProfile(
  creatorProfileId: string
): Promise<string | null> {
  // This would query the creator_profiles table for the spotify_id field
  // For now, we'll import the db and query directly
  const { db } = await import('@/lib/db');
  const { creatorProfiles } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const [profile] = await db
    .select({ spotifyId: creatorProfiles.spotifyId })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  return profile?.spotifyId ?? null;
}

/**
 * Sync releases from Spotify for a creator profile
 * This is the main entry point for the sync action
 */
export async function syncReleasesFromSpotify(
  creatorProfileId: string,
  options: SpotifyImportOptions = {}
): Promise<SpotifyImportResult> {
  // Get Spotify artist ID for this profile
  const spotifyArtistId = await getSpotifyArtistIdForProfile(creatorProfileId);

  if (!spotifyArtistId) {
    return {
      success: false,
      imported: 0,
      updated: 0,
      failed: 0,
      total: 0,
      releases: [],
      errors: [
        'No Spotify artist connected. Please connect your Spotify artist profile first.',
      ],
    };
  }

  return importReleasesFromSpotify(creatorProfileId, spotifyArtistId, options);
}
