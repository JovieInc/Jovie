/**
 * Playlist-context listen URLs.
 *
 * Opening a bare track link lets the DSP's autoplay radio continue with other
 * acts once the song ends. Opening the same track inside a playlist context
 * keeps the queue on the artist's own playlist.
 *
 * Supported formats (JOV-6765):
 * - Spotify: `open.spotify.com/track/<id>?context=spotify:playlist:<pid>`
 *   Works on web and hands off to the iOS/Android apps via universal links.
 *   Sources: https://help.feature.fm/articles/10998664715405,
 *   https://andrewsouthworth.com/spotify-playlist-deep-link-generator/
 * - Apple Music: `music.apple.com/<storefront>/playlist/.../<pid>?i=<songId>`
 *   opens the playlist with the song selected. The `i` song id is carried over
 *   from the track URL (`...?i=<songId>`).
 * - Every other DSP falls back to the plain track URL.
 */

export interface ListenPlaylistContext {
  /** Spotify playlist ID (22-char base62) or full open.spotify.com playlist URL. */
  readonly spotifyPlaylist?: string | null;
  /** Full Apple Music playlist URL (music.apple.com/.../playlist/...). */
  readonly appleMusicPlaylistUrl?: string | null;
}

const SPOTIFY_TRACK_PATH_REGEX =
  /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/[0-9A-Za-z]{22}(?:\/|$)/i;
const SPOTIFY_PLAYLIST_ID_REGEX = /^[0-9A-Za-z]{22}$/;
const SPOTIFY_PLAYLIST_URL_REGEX =
  /^https?:\/\/(?:[a-z]+\.)?spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?playlist\/([0-9A-Za-z]{22})/i;
const APPLE_SONG_ID_REGEX = /^\d+$/;

function isHost(url: URL, hostname: string): boolean {
  return url.hostname === hostname || url.hostname.endsWith(`.${hostname}`);
}

function extractSpotifyPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (SPOTIFY_PLAYLIST_ID_REGEX.test(trimmed)) return trimmed;
  const uriMatch = trimmed.match(/^spotify:playlist:([0-9A-Za-z]{22})$/);
  if (uriMatch) return uriMatch[1];
  const urlMatch = trimmed.match(SPOTIFY_PLAYLIST_URL_REGEX);
  return urlMatch?.[1] ?? null;
}

function applySpotifyPlaylistContext(
  trackUrl: string,
  playlist: string
): string {
  const playlistId = extractSpotifyPlaylistId(playlist);
  if (!playlistId) return trackUrl;

  let url: URL;
  try {
    url = new URL(trackUrl);
  } catch {
    return trackUrl;
  }

  if (!isHost(url, 'spotify.com')) return trackUrl;
  if (!SPOTIFY_TRACK_PATH_REGEX.test(url.pathname)) return trackUrl;

  // Replace any existing context, then append the literal
  // `context=spotify:playlist:<id>` (unencoded colons, matching the format
  // Spotify deep links are documented with).
  url.searchParams.delete('context');
  const existingQuery = url.searchParams.toString();
  url.search = existingQuery
    ? `${existingQuery}&context=spotify:playlist:${playlistId}`
    : `context=spotify:playlist:${playlistId}`;
  return url.toString();
}

function applyAppleMusicPlaylistContext(
  trackUrl: string,
  playlistUrl: string
): string {
  let track: URL;
  let playlist: URL;
  try {
    track = new URL(trackUrl);
    playlist = new URL(playlistUrl);
  } catch {
    return trackUrl;
  }

  if (!isHost(track, 'music.apple.com')) return trackUrl;
  if (!isHost(playlist, 'music.apple.com')) return trackUrl;
  if (!playlist.pathname.includes('/playlist/')) return trackUrl;

  const songId = track.searchParams.get('i');
  if (!songId || !APPLE_SONG_ID_REGEX.test(songId)) return trackUrl;

  playlist.searchParams.set('i', songId);
  return playlist.toString();
}

/**
 * Rewrite a provider track URL so it opens inside the artist's configured
 * playlist. Returns the original URL for unsupported providers, non-track
 * URLs, or when no playlist is configured for that DSP.
 */
export function applyPlaylistContext(
  providerKey: string,
  trackUrl: string | null | undefined,
  playlist: ListenPlaylistContext | null | undefined
): string | null {
  if (!trackUrl || !playlist) return trackUrl ?? null;

  if (providerKey === 'spotify' && playlist.spotifyPlaylist) {
    return applySpotifyPlaylistContext(trackUrl, playlist.spotifyPlaylist);
  }

  if (providerKey === 'apple_music' && playlist.appleMusicPlaylistUrl) {
    return applyAppleMusicPlaylistContext(
      trackUrl,
      playlist.appleMusicPlaylistUrl
    );
  }

  return trackUrl;
}
