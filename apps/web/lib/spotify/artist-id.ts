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

export type SpotifyArtistIdentityResolution =
  | { readonly status: 'resolved'; readonly spotifyArtistId: string }
  | { readonly status: 'missing' | 'conflict'; readonly spotifyArtistId: null };

/**
 * Resolve one exact Spotify artist identity from structured profile fields.
 *
 * Legacy profiles may only retain the active Spotify social-link URL, while
 * newer profiles also populate spotify_id/spotify_url. Conflicting exact IDs
 * fail closed so callers never choose an owner identity by display name.
 */
export function resolveSpotifyArtistIdentity(
  values: readonly (string | null | undefined)[]
): SpotifyArtistIdentityResolution {
  const ids = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const id = extractSpotifyArtistId(value);
    if (id) ids.add(id);
  }

  if (ids.size === 0) {
    return { status: 'missing', spotifyArtistId: null };
  }
  if (ids.size > 1) {
    return { status: 'conflict', spotifyArtistId: null };
  }

  return { status: 'resolved', spotifyArtistId: [...ids][0]! };
}
