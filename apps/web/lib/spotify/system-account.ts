export const SPOTIFY_OAUTH_TOKEN_STRATEGY = 'oauth_spotify' as const;

export const SPOTIFY_EXTERNAL_ACCOUNT_PROVIDERS = [
  'spotify',
  'oauth_spotify',
] as const;

export const REQUIRED_PLAYLIST_SPOTIFY_SCOPES = [
  'playlist-modify-public',
  'playlist-read-private',
  'ugc-image-upload',
] as const;

export type PlaylistSpotifyScope =
  (typeof REQUIRED_PLAYLIST_SPOTIFY_SCOPES)[number];
