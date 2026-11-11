/**
 * Destination-row link helpers (shared by every outbound destination row:
 * DSPs, YouTube, and any future network row in the shell).
 *
 * Two derivations, both pure and honest: a platform-native URI is derived
 * ONLY when the network has a well-known URI scheme (never guessed), and a
 * Jovie link is stamped with the destination's UTM attribution using the
 * shared UTM builder (lib/utm).
 */

import { buildUTMUrlString } from '@/lib/utm';

/** Network types with a documented native URI scheme. */
const SPOTIFY_TYPE_PATTERN =
  /^\/(?:album|track|artist|playlist|episode|show)\/([A-Za-z0-9]+)$/;

/**
 * Derive a platform-native URI from a destination URL.
 * Returns null when the network has no well-known URI scheme (Apple Music,
 * Deezer, Bandcamp ship canonical https URLs instead).
 */
export function deriveNativeUri(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '');

  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    const match = parsed.pathname.match(SPOTIFY_TYPE_PATTERN);
    if (match) return `spotify:${parsed.pathname.split('/')[1]}:${match[1]}`;
    return null;
  }

  if (host === 'youtube.com' || host === 'music.youtube.com') {
    const videoId = parsed.searchParams.get('v');
    if (videoId) return `vnd.youtube:${videoId}`;
    return null;
  }

  if (host === 'youtu.be') {
    const videoId = parsed.pathname.slice(1).split('/')[0];
    return videoId ? `vnd.youtube:${videoId}` : null;
  }

  return null;
}

/**
 * Build the Jovie smart-link URL for a destination row, stamped with that
 * destination's UTM attribution (utm_source = the network, utm_medium = the
 * surface the copy happened on).
 */
export function buildDestinationJovieLink({
  baseUrl,
  linkPath,
  destinationKey,
  surface,
}: {
  readonly baseUrl: string;
  /** Jovie smart-link path beginning with '/', e.g. '/tim/seaside-heights'. */
  readonly linkPath: string;
  /** Destination key for utm_source, e.g. 'spotify'. */
  readonly destinationKey: string;
  /** Copying surface for utm_medium, e.g. 'work-inspector'. */
  readonly surface: string;
}): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const path = linkPath.startsWith('/') ? linkPath : `/${linkPath}`;
  return buildUTMUrlString({
    url: `${base}${path}`,
    params: {
      utm_source: destinationKey,
      utm_medium: surface,
    },
  });
}
