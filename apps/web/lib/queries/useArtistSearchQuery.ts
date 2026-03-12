'use client';

/**
 * Artist Search Query Hook
 *
 * TanStack Query-based artist search with debouncing via TanStack Pacer.
 * Provides cached search results for instant lookup of previously searched terms.
 *
 * @see https://tanstack.com/query
 * @see https://tanstack.com/pacer
 */

import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import {
  type ArtistSearchState,
  useUnifiedArtistSearchQuery,
} from './useUnifiedArtistSearchQuery';

export interface SpotifyArtistResult {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
  followers?: number;
  popularity: number;
  verified?: boolean;
}

export interface UseArtistSearchQueryOptions {
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
  /** Max results to fetch (default 5) */
  limit?: number;
  /** Min query length to trigger search (default 1) */
  minQueryLength?: number;
}

export interface UseArtistSearchQueryReturn {
  results: SpotifyArtistResult[];
  state: ArtistSearchState;
  error: string | null;
  /** Debounced search - call on every keystroke */
  search: (query: string) => void;
  /** Immediate search - bypasses debounce */
  searchImmediate: (query: string) => void;
  /** Clear results and reset state */
  clear: () => void;
  /** Current query being searched */
  query: string;
  /** Whether the debounce is pending */
  isPending: boolean;
}

const DEFAULT_MIN_QUERY_LENGTH = 1;

async function fetchArtistSearch(
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<SpotifyArtistResult[]> {
  try {
    return await fetchWithTimeout<SpotifyArtistResult[]>(
      `/api/spotify/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal }
    );
  } catch (error) {
    if (error instanceof FetchError) {
      if (error.status === 429) {
        const rateLimitError = new Error(
          'Too many requests. Please wait a moment.'
        );
        rateLimitError.name = 'RateLimitError';
        throw rateLimitError;
      }
      if (error.response) {
        const data = await error.response.json().catch(() => ({}));
        error.message = data?.error || error.message || 'Search failed';
        throw error;
      }
    }
    throw error;
  }
}

export function useArtistSearchQuery(
  options: UseArtistSearchQueryOptions = {}
): UseArtistSearchQueryReturn {
  const { minQueryLength = DEFAULT_MIN_QUERY_LENGTH, ...rest } = options;

  return useUnifiedArtistSearchQuery<SpotifyArtistResult>({
    ...rest,
    minQueryLength,
    queryKey: queryKeys.spotify.artistSearch,
    searchFn: fetchArtistSearch,
    shouldBypassDebounce: query =>
      query.length === 1 && /^[a-zA-Z]$/.test(query),
  });
}
