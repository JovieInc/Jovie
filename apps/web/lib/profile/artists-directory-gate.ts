import { APP_ROUTES } from '@/constants/routes';

/**
 * A directory with a handful of profiles advertises that we have no users.
 * Below this many real (non-internal, discovery-eligible) public profiles the
 * page is not published: /artists redirects, and the footer does not link it.
 * `loadArtistsDirectoryCount` already counts only eligible identities.
 * Raise or lower this one number; nothing else encodes it.
 */
export const ARTISTS_DIRECTORY_MIN_PROFILES = 12;

export const ARTISTS_DIRECTORY_FALLBACK_HREF = APP_ROUTES.ARTIST_PROFILES;

export function isArtistsDirectoryPublishable(
  total: number | null | undefined
): boolean {
  return typeof total === 'number' && total >= ARTISTS_DIRECTORY_MIN_PROFILES;
}
