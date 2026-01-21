/**
 * Spotify Integration Flow
 *
 * Handles fetching artist names from the Spotify API for
 * Spotify artist profiles during ingestion.
 *
 * Extracted to reduce cognitive complexity of the creator-ingest route.
 */

import { logger } from '@/lib/utils/logger';

/**
 * Fetch the artist name from Spotify API for a Spotify artist handle.
 *
 * @param handle - Handle that may be a Spotify artist ID (prefixed with 'artist-')
 * @param platformId - Platform identifier to verify this is a Spotify URL
 * @returns Artist name from Spotify, or null if not a Spotify artist or fetch failed
 */
export async function fetchSpotifyArtistName(
  handle: string,
  platformId: string
): Promise<string | null> {
  const isSpotifyArtist =
    handle.startsWith('artist-') && platformId === 'spotify';
  if (!isSpotifyArtist) {
    return null;
  }

  try {
    const { getSpotifyArtist } = await import('@/lib/spotify');
    const artistId = handle.replace('artist-', '');
    const artist = await getSpotifyArtist(artistId);
    if (artist?.name) {
      logger.info('Fetched Spotify artist name', {
        artistId,
        name: artist.name,
      });
      return artist.name;
    }
  } catch (error) {
    logger.warn('Failed to fetch Spotify artist name', {
      handle,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  return null;
}
