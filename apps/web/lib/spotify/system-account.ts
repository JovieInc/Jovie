export const REQUIRED_PLAYLIST_SPOTIFY_SCOPES = [
  'playlist-modify-public',
  'playlist-read-private',
  'ugc-image-upload',
] as const;

export type PlaylistSpotifyScope =
  (typeof REQUIRED_PLAYLIST_SPOTIFY_SCOPES)[number];
