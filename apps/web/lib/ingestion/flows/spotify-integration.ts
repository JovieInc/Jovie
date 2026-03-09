/**
 * Spotify Integration Flow
 *
 * Handles fetching artist data from the Spotify API for
 * Spotify artist profiles during ingestion.
 *
 * Extracted to reduce cognitive complexity of the creator-ingest route.
 */

import { logger } from '@/lib/utils/logger';

/**
 * Subset of Spotify artist data relevant for profile creation.
 */
export interface SpotifyArtistData {
  name: string;
  spotifyId: string;
  imageUrl: string | null;
  genres: string[];
  followerCount: number;
  popularity: number;
  spotifyUrl: string | null;
  bio: string | null;
}

/**
 * Fetch full artist data from Spotify API for a Spotify artist handle.
 *
 * @param handle - Handle that may be a Spotify artist ID (prefixed with 'artist_')
 * @param platformId - Platform identifier to verify this is a Spotify URL
 * @returns Spotify artist data, or null if not a Spotify artist or fetch failed
 */
export async function fetchSpotifyArtistData(
  handle: string,
  platformId: string
): Promise<SpotifyArtistData | null> {
  const isSpotifyArtist =
    handle.startsWith('artist_') && platformId === 'spotify';
  if (!isSpotifyArtist) {
    return null;
  }

  try {
    const { getSpotifyArtist } = await import('@/lib/spotify');
    const artistId = handle.replace('artist_', '');
    const artist = await getSpotifyArtist(artistId);
    if (artist?.name) {
      // Pick the best image (largest available)
      const bestImage = artist.images
        ?.slice()
        .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];

      const data: SpotifyArtistData = {
        name: artist.name,
        spotifyId: artist.id,
        imageUrl: bestImage?.url ?? null,
        genres:
          'genres' in artist
            ? (((artist as Record<string, unknown>).genres as string[]) ?? [])
            : [],
        followerCount: artist.followers?.total ?? 0,
        popularity: artist.popularity ?? 0,
        spotifyUrl: `https://open.spotify.com/artist/${artist.id}`,
        bio: null,
      };

      logger.info('Fetched Spotify artist data', {
        artistId,
        name: data.name,
        hasImage: !!data.imageUrl,
        genres: data.genres.length,
        followers: data.followerCount,
      });

      return data;
    }
  } catch (error) {
    logger.warn('Failed to fetch Spotify artist data', {
      handle,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  return null;
}

/**
 * Fetch the artist name from Spotify API for a Spotify artist handle.
 *
 * @deprecated Use fetchSpotifyArtistData for full metadata.
 * @param handle - Handle that may be a Spotify artist ID (prefixed with 'artist_')
 * @param platformId - Platform identifier to verify this is a Spotify URL
 * @returns Artist name from Spotify, or null if not a Spotify artist or fetch failed
 */
export async function fetchSpotifyArtistName(
  handle: string,
  platformId: string
): Promise<string | null> {
  const data = await fetchSpotifyArtistData(handle, platformId);
  return data?.name ?? null;
}
