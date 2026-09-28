import { REQUIRED_PLAYLIST_SPOTIFY_SCOPES } from '@/lib/spotify/system-account';

/**
 * Spotify connector OAuth scopes. Publisher-required scopes come from
 * `lib/spotify/system-account.ts` so consent and capability checks can't drift.
 */
export const SPOTIFY_OAUTH_SCOPES = [
  'user-read-email',
  'user-read-private',
  ...REQUIRED_PLAYLIST_SPOTIFY_SCOPES,
  'playlist-modify-private',
] as const;
