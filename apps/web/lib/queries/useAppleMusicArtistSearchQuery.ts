'use client';

/**
 * Apple Music Artist Search Query Hook
 *
 * TanStack Query-based artist search for Apple Music with debouncing.
 * Mirrors useArtistSearchQuery but targets the Apple Music search API.
 */

import type { AppleMusicArtistResult } from '@/lib/contracts/api';

export type { AppleMusicArtistResult } from '@/lib/contracts/api';

import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import {
  type ArtistSearchState,
  useUnifiedArtistSearchQuery,
} from './useUnifiedArtistSearchQuery';

export type AppleMusicSearchState = ArtistSearchState;

export interface UseAppleMusicArtistSearchQueryOptions {
  debounceMs?: number;
  limit?: number;
  minQueryLength?: number;
}

export interface UseAppleMusicArtistSearchQueryReturn {
  results: AppleMusicArtistResult[];
  state: AppleMusicSearchState;
  error: string | null;
  search: (query: string) => void;
  searchImmediate: (query: string) => void;
  clear: () => void;
  query: string;
  isPending: boolean;
}

const DEFAULT_MIN_QUERY_LENGTH = 2;

async function fetchAppleMusicArtistSearch(
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<AppleMusicArtistResult[]> {
  try {
    return await fetchWithTimeout<AppleMusicArtistResult[]>(
      `/api/apple-music/search?q=${encodeURIComponent(query)}&limit=${limit}`,
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

export function useAppleMusicArtistSearchQuery(
  options: UseAppleMusicArtistSearchQueryOptions = {}
): UseAppleMusicArtistSearchQueryReturn {
  const { minQueryLength = DEFAULT_MIN_QUERY_LENGTH, ...rest } = options;

  return useUnifiedArtistSearchQuery<AppleMusicArtistResult>({
    ...rest,
    minQueryLength,
    queryKey: queryKeys.appleMusic.artistSearch,
    searchFn: fetchAppleMusicArtistSearch,
  });
}
