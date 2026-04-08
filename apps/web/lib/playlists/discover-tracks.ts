/**
 * Spotify Track Discovery
 *
 * Searches Spotify for tracks matching the playlist concept.
 * Returns candidate tracks for the LLM curation step.
 */

import 'server-only';
import { captureError } from '@/lib/error-tracking';
import { jovieSpotifyFetch } from '@/lib/spotify/jovie-account';

// ============================================================================
// Types
// ============================================================================

export interface CandidateTrack {
  id: string;
  name: string;
  artist: string;
  artistId: string;
  popularity: number;
  durationMs: number;
  previewUrl: string | null;
  albumName: string;
  albumArtUrl: string | null;
}

interface SpotifyTrackItem {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  popularity: number;
  duration_ms: number;
  preview_url: string | null;
  album: {
    name: string;
    images: Array<{ url: string; width: number; height: number }>;
  };
}

interface SpotifySearchTracksResponse {
  tracks: {
    items: SpotifyTrackItem[];
    total: number;
    offset: number;
    limit: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum popularity to include in candidates (filters low-quality/bot tracks) */
const MIN_POPULARITY = 15;

/** Maximum tracks per search query */
const TRACKS_PER_QUERY = 20;

// ============================================================================
// Main Function
// ============================================================================

/**
 * Search Spotify for tracks matching the playlist concept queries.
 * Returns deduplicated candidate tracks sorted by popularity.
 */
export async function discoverTracks(
  trackQueries: string[],
  options?: { minPopularity?: number; maxCandidates?: number }
): Promise<CandidateTrack[]> {
  const minPop = options?.minPopularity ?? MIN_POPULARITY;
  const maxCandidates = options?.maxCandidates ?? 100;

  const seen = new Set<string>();
  const candidates: CandidateTrack[] = [];

  // Search in batches to avoid rate limits
  for (const query of trackQueries) {
    if (candidates.length >= maxCandidates) break;

    try {
      const encoded = encodeURIComponent(query);
      const response = await jovieSpotifyFetch(
        `/search?q=${encoded}&type=track&limit=${TRACKS_PER_QUERY}`
      );

      if (!response.ok) {
        captureError('[Discover Tracks] Search failed', null, {
          query,
          status: response.status,
        });
        continue;
      }

      const data: SpotifySearchTracksResponse = await response.json();

      for (const track of data.tracks.items) {
        if (seen.has(track.id)) continue;
        if (track.popularity < minPop) continue;

        seen.add(track.id);
        candidates.push({
          id: track.id,
          name: track.name,
          artist: track.artists[0]?.name ?? 'Unknown',
          artistId: track.artists[0]?.id ?? '',
          popularity: track.popularity,
          durationMs: track.duration_ms,
          previewUrl: track.preview_url,
          albumName: track.album.name,
          albumArtUrl: track.album.images[0]?.url ?? null,
        });
      }
    } catch (error) {
      captureError('[Discover Tracks] Query failed', error, { query });
      // Continue with other queries
    }
  }

  // Sort by popularity descending
  candidates.sort((a, b) => b.popularity - a.popularity);

  return candidates.slice(0, maxCandidates);
}
