import * as Sentry from '@sentry/nextjs';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases, discogTracks, providerLinks } from '@/lib/db/schema';
import {
  buildSpotifyAlbumUrl,
  buildSpotifyTrackUrl,
  getBestSpotifyImage,
  getSpotifyAlbums,
  getSpotifyArtistAlbums,
  mapSpotifyAlbumType,
  parseSpotifyReleaseDate,
  type SpotifyAlbum,
  type SpotifyAlbumFull,
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
import { generateUniqueSlug } from './slug';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of releases to import in a single operation */
const MAX_RELEASES_PER_IMPORT = 200;

/** Maximum number of tracks per release */
const MAX_TRACKS_PER_RELEASE = 100;

export interface SpotifyImportResult {
  success: boolean;
  imported: number;
  updated: number;
  failed: number;
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
      const existingProviders = release.providerLinks.map(l => l.providerId);
      await discoverLinksForRelease(release.id, existingProviders, {
        skipExisting: true,
        storefront: market.toLowerCase(),
      });
    } catch (error) {
      // Don't fail the whole import if discovery fails
      console.debug(`Discovery failed for ${release.title}:`, error);
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

      Sentry.captureException(error, {
        tags: { source: 'spotify_import' },
        extra: {
          albumId: album.id,
          albumName: sanitizedAlbumName,
          creatorProfileId,
        },
      });

      console.error(`Failed to import album ${album.id}:`, error);
    }
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
        const spotifyAlbums = await getSpotifyArtistAlbums(spotifyArtistId, {
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
        if (spotifyAlbums.length > MAX_RELEASES_PER_IMPORT) {
          console.warn(
            `[Spotify Import] Truncating ${spotifyAlbums.length} releases to ${MAX_RELEASES_PER_IMPORT}`
          );
          Sentry.captureMessage('Spotify import truncated due to limit', {
            level: 'info',
            extra: {
              totalReleases: spotifyAlbums.length,
              limit: MAX_RELEASES_PER_IMPORT,
              spotifyArtistId,
            },
          });
        }

        span.setAttribute('spotify.album_count', albumsToImport.length);

        // 2. Get full album details (includes tracks and UPC)
        const albumIds = albumsToImport.map(a => a.id);
        const fullAlbums = includeTracks
          ? await getSpotifyAlbums(albumIds, market)
          : [];

        // Create a map for quick lookup
        const fullAlbumMap = new Map<string, SpotifyAlbumFull>();
        for (const album of fullAlbums) {
          fullAlbumMap.set(album.id, album);
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

        Sentry.captureException(error, {
          tags: { source: 'spotify_import' },
          extra: { spotifyArtistId, creatorProfileId },
        });

        console.error('Spotify import failed:', error);
        return result;
      }
    }
  );
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
  // Sanitize album name before use
  const sanitizedTitle = sanitizeName(album.name);

  // If this album was previously imported, preserve its slug for stability.
  const [existingRelease] = await db
    .select({
      id: discogReleases.id,
      slug: discogReleases.slug,
    })
    .from(providerLinks)
    .innerJoin(discogReleases, eq(discogReleases.id, providerLinks.releaseId))
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        eq(providerLinks.providerId, 'spotify'),
        eq(providerLinks.externalId, album.id)
      )
    )
    .limit(1);

  // Generate clean slug from title (no more Spotify ID suffix!)
  const slug =
    existingRelease?.slug ??
    (await generateUniqueSlug(
      creatorProfileId,
      sanitizedTitle,
      'release',
      existingRelease?.id
    ));

  // Determine release type
  // Spotify doesn't distinguish EPs, so we infer from track count
  let releaseType = mapSpotifyAlbumType(album.album_type);
  if (
    releaseType === 'album' &&
    album.total_tracks >= 4 &&
    album.total_tracks <= 6
  ) {
    releaseType = 'ep';
  }

  // Parse release date
  const releaseDate = parseSpotifyReleaseDate(
    album.release_date,
    album.release_date_precision
  );

  // Get best artwork and sanitize URL
  const rawArtworkUrl = getBestSpotifyImage(album.images);
  const artworkUrl = rawArtworkUrl ? sanitizeImageUrl(rawArtworkUrl) : null;

  // Sanitize label if present
  const sanitizedLabel = fullAlbum?.label
    ? sanitizeText(fullAlbum.label, 200)
    : null;

  // Sanitize UPC (alphanumeric only, max 20 chars)
  const sanitizedUpc = fullAlbum?.external_ids?.upc
    ? fullAlbum.external_ids.upc.replaceAll(/[^a-zA-Z0-9]/g, '').slice(0, 20)
    : null;

  // Get popularity from full album (more reliable) or basic album.
  // Spotify's API returns 0-100, but guard against unexpected/invalid values.
  const rawPopularity = fullAlbum?.popularity ?? album.popularity;
  const popularity =
    typeof rawPopularity === 'number' && Number.isFinite(rawPopularity)
      ? Math.min(100, Math.max(0, Math.round(rawPopularity)))
      : null;

  // Upsert the release with sanitized data
  const release = await upsertRelease({
    creatorProfileId,
    title: sanitizedTitle,
    slug,
    releaseType,
    releaseDate,
    label: sanitizedLabel,
    upc: sanitizedUpc,
    totalTracks: Math.min(album.total_tracks, MAX_TRACKS_PER_RELEASE),
    isExplicit: false, // Will be updated from tracks if available
    artworkUrl,
    spotifyPopularity: popularity,
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
    externalId: album.id,
    sourceType: 'ingested',
    isPrimary: true,
  });

  // Process release-level artist credits
  // Convert Spotify artists to the format expected by the parser
  const releaseArtistInputs: SpotifyArtistInput[] = album.artists.map(a => ({
    id: a.id,
    name: sanitizeName(a.name),
    images: fullAlbum?.images,
  }));

  const releaseArtistCredits = parseMainArtists(releaseArtistInputs);
  await processReleaseArtistCredits(release.id, releaseArtistCredits, {
    deleteExisting: true,
    sourceType: 'ingested',
  });

  // Import tracks if we have full album data
  if (fullAlbum?.tracks?.items) {
    let hasExplicit = false;

    // Limit tracks per release for safety
    const tracksToImport = fullAlbum.tracks.items.slice(
      0,
      MAX_TRACKS_PER_RELEASE
    );

    // Pre-fetch any existing track slugs by Spotify ID so re-imports don't churn slugs.
    const spotifyTrackIds = tracksToImport.map(t => t.id).filter(Boolean);
    const existingTracksBySpotifyId = new Map<
      string,
      { id: string; slug: string }
    >();
    if (spotifyTrackIds.length > 0) {
      const rows = await db
        .select({
          id: discogTracks.id,
          slug: discogTracks.slug,
          spotifyTrackId: providerLinks.externalId,
        })
        .from(providerLinks)
        .innerJoin(discogTracks, eq(discogTracks.id, providerLinks.trackId))
        .where(
          and(
            eq(providerLinks.ownerType, 'track'),
            eq(providerLinks.providerId, 'spotify'),
            inArray(providerLinks.externalId, spotifyTrackIds)
          )
        );

      for (const row of rows) {
        if (!row.spotifyTrackId) continue;
        existingTracksBySpotifyId.set(row.spotifyTrackId, {
          id: row.id,
          slug: row.slug,
        });
      }
    }

    for (const track of tracksToImport) {
      if (track.explicit) {
        hasExplicit = true;
      }

      // Sanitize track title
      const sanitizedTrackTitle = sanitizeName(track.name);
      const existingTrack = track.id
        ? existingTracksBySpotifyId.get(track.id)
        : undefined;

      // Generate clean slug for track (no more Spotify ID suffix!)
      // Preserve existing slug for stable URLs across re-imports.
      const trackSlug =
        existingTrack?.slug ??
        (await generateUniqueSlug(
          creatorProfileId,
          sanitizedTrackTitle,
          'track',
          existingTrack?.id
        ));

      // Sanitize ISRC (alphanumeric only, max 12 chars, uppercase for consistency)
      const sanitizedIsrc = track.external_ids?.isrc
        ? track.external_ids.isrc
            .replaceAll(/[^a-zA-Z0-9]/g, '')
            .slice(0, 12)
            .toUpperCase()
        : null;

      // Sanitize preview URL
      const sanitizedPreviewUrl = track.preview_url
        ? sanitizeSpotifyPreviewUrl(track.preview_url)
        : null;

      const createdTrack = await upsertTrack({
        releaseId: release.id,
        creatorProfileId,
        title: sanitizedTrackTitle,
        slug: trackSlug,
        trackNumber: Math.max(1, Math.min(track.track_number, 999)),
        discNumber: Math.max(1, Math.min(track.disc_number, 99)),
        durationMs: Math.max(0, Math.min(track.duration_ms, 60 * 60 * 1000)), // Max 1 hour
        isExplicit: track.explicit,
        isrc: sanitizedIsrc,
        previewUrl: sanitizedPreviewUrl,
        sourceType: 'ingested',
        metadata: {
          spotifyId: track.id,
          spotifyUri: track.uri,
        },
      });

      // Create Spotify provider link for the track
      await upsertProviderLink({
        trackId: createdTrack.id,
        providerId: 'spotify',
        url: buildSpotifyTrackUrl(track.id),
        externalId: track.id,
        sourceType: 'ingested',
        isPrimary: true,
      });

      // Process track-level artist credits
      // Parse from both the Spotify artists array and the track title (for feat., remix, etc.)
      const trackArtistInputs: SpotifyArtistInput[] = track.artists.map(a => ({
        id: a.id,
        name: sanitizeName(a.name),
      }));

      const trackArtistCredits = parseArtistCredits(
        track.name, // Original title (before sanitization) for feat/remix parsing
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
      releases: [],
      errors: [
        'No Spotify artist connected. Please connect your Spotify artist profile first.',
      ],
    };
  }

  return importReleasesFromSpotify(creatorProfileId, spotifyArtistId, options);
}
