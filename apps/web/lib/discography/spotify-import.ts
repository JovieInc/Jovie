import {
  buildSpotifyAlbumUrl,
  generateReleaseSlug,
  getBestSpotifyImage,
  getSpotifyAlbums,
  getSpotifyArtistAlbums,
  mapSpotifyAlbumType,
  parseSpotifyReleaseDate,
  type SpotifyAlbum,
  type SpotifyAlbumFull,
} from '@/lib/spotify';
import { discoverLinksForRelease } from './discovery';
import {
  getReleasesForProfile,
  type ReleaseWithProviders,
  upsertProviderLink,
  upsertRelease,
  upsertTrack,
} from './queries';

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
 * Import all releases from a Spotify artist profile into the database
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

    // 2. Get full album details (includes tracks and UPC)
    const albumIds = spotifyAlbums.map(a => a.id);
    const fullAlbums = includeTracks
      ? await getSpotifyAlbums(albumIds, market)
      : [];

    // Create a map for quick lookup
    const fullAlbumMap = new Map<string, SpotifyAlbumFull>();
    for (const album of fullAlbums) {
      fullAlbumMap.set(album.id, album);
    }

    // 3. Import each album
    for (const album of spotifyAlbums) {
      try {
        const fullAlbum = fullAlbumMap.get(album.id);
        await importSingleRelease(creatorProfileId, album, fullAlbum);
        result.imported++;
      } catch (error) {
        result.failed++;
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to import "${album.name}": ${message}`);
        console.error(`Failed to import album ${album.id}:`, error);
      }
    }

    // 4. Discover cross-platform links
    if (discoverLinks && includeTracks) {
      // Get the imported releases to discover links
      const importedReleases = await getReleasesForProfile(creatorProfileId);

      for (const release of importedReleases) {
        try {
          // Get existing provider IDs to skip
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

    // 5. Fetch the final state
    result.releases = await getReleasesForProfile(creatorProfileId);
    result.success = result.failed === 0;

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Import failed: ${message}`);
    console.error('Spotify import failed:', error);
    return result;
  }
}

/**
 * Import a single release from Spotify data
 */
async function importSingleRelease(
  creatorProfileId: string,
  album: SpotifyAlbum,
  fullAlbum?: SpotifyAlbumFull
): Promise<void> {
  // Generate slug from title and Spotify ID
  const slug = generateReleaseSlug(album.name, album.id);

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

  // Get best artwork
  const artworkUrl = getBestSpotifyImage(album.images);

  // Upsert the release
  const release = await upsertRelease({
    creatorProfileId,
    title: album.name,
    slug,
    releaseType,
    releaseDate,
    label: fullAlbum?.label ?? null,
    upc: fullAlbum?.external_ids?.upc ?? null,
    totalTracks: album.total_tracks,
    isExplicit: false, // Will be updated from tracks if available
    artworkUrl,
    sourceType: 'ingested',
    metadata: {
      spotifyId: album.id,
      spotifyUri: album.uri,
      spotifyArtists: album.artists.map(a => ({
        id: a.id,
        name: a.name,
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

  // Import tracks if we have full album data
  if (fullAlbum?.tracks?.items) {
    let hasExplicit = false;

    for (const track of fullAlbum.tracks.items) {
      if (track.explicit) {
        hasExplicit = true;
      }

      const trackSlug = generateReleaseSlug(track.name, track.id);

      await upsertTrack({
        releaseId: release.id,
        creatorProfileId,
        title: track.name,
        slug: trackSlug,
        trackNumber: track.track_number,
        discNumber: track.disc_number,
        durationMs: track.duration_ms,
        isExplicit: track.explicit,
        isrc: track.external_ids?.isrc ?? null,
        previewUrl: track.preview_url,
        sourceType: 'ingested',
        metadata: {
          spotifyId: track.id,
          spotifyUri: track.uri,
        },
      });
    }

    // Update release explicit flag if any track is explicit
    if (hasExplicit) {
      await upsertRelease({
        creatorProfileId,
        title: album.name,
        slug,
        isExplicit: true,
      });
    }
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
