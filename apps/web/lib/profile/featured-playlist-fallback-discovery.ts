import 'server-only';

import { captureWarning } from '@/lib/error-tracking';
import { searchGoogleCSE } from '@/lib/leads/google-cse';
import {
  type FeaturedPlaylistFallbackCandidate,
  normalizeSpotifyPlaylistUrl,
  PLAYLIST_SOURCE,
  validateThisIsPlaylistPage,
} from '@/lib/profile/featured-playlist-fallback-web';

const SPOTIFY_WEB_TIMEOUT_MS = 8_000;
const MAX_PAGE_FETCH_ATTEMPTS = 2;
const PLAYLIST_QUERY_TEMPLATES = [
  'site:open.spotify.com/playlist "This Is {artistName}"',
  'site:open.spotify.com/playlist "This Is {artistName}" "Spotify Playlist"',
] as const;

async function fetchSpotifyPublicPage(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_PAGE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(SPOTIFY_WEB_TIMEOUT_MS),
      });

      if (response.ok) {
        return await response.text();
      }

      if (response.status >= 500 && attempt < MAX_PAGE_FETCH_ATTEMPTS) {
        continue;
      }

      await captureWarning(
        'Spotify playlist page returned non-ok response',
        null,
        {
          route: 'featured-playlist-fallback-discovery',
          status: response.status,
          url,
        }
      );
      return null;
    } catch (error) {
      if (attempt < MAX_PAGE_FETCH_ATTEMPTS) {
        continue;
      }

      await captureWarning('Spotify playlist page fetch failed', error, {
        route: 'featured-playlist-fallback-discovery',
        url,
      });
      return null;
    }
  }

  return null;
}

export async function discoverThisIsPlaylistCandidate(input: {
  readonly artistName: string;
  readonly artistSpotifyId: string;
}): Promise<FeaturedPlaylistFallbackCandidate | null> {
  const artistName = input.artistName.trim();
  const artistSpotifyId = input.artistSpotifyId.trim();

  if (!artistName || !artistSpotifyId) {
    return null;
  }

  const seenPlaylistIds = new Set<string>();

  for (const queryTemplate of PLAYLIST_QUERY_TEMPLATES) {
    const query = queryTemplate.replace('{artistName}', artistName);
    const searchResults = await searchGoogleCSE(query, 1);

    for (const result of searchResults) {
      const normalizedUrl = normalizeSpotifyPlaylistUrl(result.link);
      if (!normalizedUrl || seenPlaylistIds.has(normalizedUrl.playlistId)) {
        continue;
      }

      seenPlaylistIds.add(normalizedUrl.playlistId);

      const html = await fetchSpotifyPublicPage(normalizedUrl.url);
      if (!html) {
        continue;
      }

      const validated = validateThisIsPlaylistPage({
        artistName,
        artistSpotifyId,
        html,
        playlistId: normalizedUrl.playlistId,
        url: normalizedUrl.url,
      });

      if (validated) {
        return {
          ...validated,
          artistSpotifyId,
          discoveredAt: new Date().toISOString(),
          searchQuery: query,
          source: PLAYLIST_SOURCE,
        };
      }
    }
  }

  return null;
}
