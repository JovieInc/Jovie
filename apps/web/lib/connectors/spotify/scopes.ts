import { REQUIRED_PLAYLIST_SPOTIFY_SCOPES } from '@/lib/spotify/system-account';

/**
 * Spotify connector OAuth scopes.
 *
 * `user-read-email` / `user-read-private` identify the connected account so the
 * Integrations surface can label it; `playlist-modify-private` lets agent
 * workflows manage private drafts. The publisher-required scopes come from
 * `lib/spotify/system-account.ts` so the consent screen and the playlist
 * capability check can never drift apart.
 */
export const SPOTIFY_OAUTH_SCOPES = [
  'user-read-email',
  'user-read-private',
  ...REQUIRED_PLAYLIST_SPOTIFY_SCOPES,
  'playlist-modify-private',
] as const;
