import { spotifyArtistIdSchema } from '@/lib/validation/schemas/spotify';

/**
 * Extract a Spotify artist ID from either a direct ID or Spotify artist URL.
 */
export function extractSpotifyArtistId(value: string): string | null {
  const trimmed = value.trim();
  const directId = spotifyArtistIdSchema.safeParse(trimmed);
  if (directId.success) {
    return directId.data;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== 'open.spotify.com') {
      return null;
    }

    const pathSegments = url.pathname.split('/').filter(Boolean);
    if (pathSegments[0] !== 'artist' || !pathSegments[1]) {
      return null;
    }

    const idResult = spotifyArtistIdSchema.safeParse(pathSegments[1]);
    return idResult.success ? idResult.data : null;
  } catch {
    return null;
  }
}
