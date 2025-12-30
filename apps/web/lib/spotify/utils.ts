/**
 * Spotify utility functions
 */

import type { SpotifyAlbum, SpotifyImage } from './types';

/**
 * Build Spotify artist URL from artist ID
 */
export function buildSpotifyArtistUrl(artistId: string): string {
  return `https://open.spotify.com/artist/${artistId}`;
}

/**
 * Build Spotify album URL from album ID
 */
export function buildSpotifyAlbumUrl(albumId: string): string {
  return `https://open.spotify.com/album/${albumId}`;
}

/**
 * Build Spotify track URL from track ID
 */
export function buildSpotifyTrackUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`;
}

/**
 * Map Spotify album_type to our release type
 */
export function mapSpotifyAlbumType(
  albumType: SpotifyAlbum['album_type']
): 'single' | 'ep' | 'album' | 'compilation' {
  switch (albumType) {
    case 'single':
      return 'single';
    case 'compilation':
      return 'compilation';
    case 'album':
    default:
      return 'album';
  }
}

/**
 * Parse Spotify release date to Date object
 * Handles year, month, and day precision
 */
export function parseSpotifyReleaseDate(
  releaseDate: string,
  precision: SpotifyAlbum['release_date_precision']
): Date {
  switch (precision) {
    case 'year':
      return new Date(`${releaseDate}-01-01`);
    case 'month':
      return new Date(`${releaseDate}-01`);
    case 'day':
    default:
      return new Date(releaseDate);
  }
}

/**
 * Get the best quality artwork URL from Spotify images
 */
export function getBestSpotifyImage(images: SpotifyImage[]): string | null {
  if (!images || images.length === 0) {
    return null;
  }

  // Sort by height descending and return the largest
  const sorted = [...images].sort((a, b) => (b.height || 0) - (a.height || 0));
  return sorted[0]?.url ?? null;
}

/**
 * Generate a URL-safe slug from a release title
 */
export function generateReleaseSlug(title: string, spotifyId: string): string {
  const slugified = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);

  // Append short ID for uniqueness
  const shortId = spotifyId.slice(-6);
  return `${slugified}-${shortId}`;
}
