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

import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { PACER_TIMING } from '@/lib/pacer/hooks';
import { queryKeys } from './keys';

// Response shape from /api/spotify/search
export interface SpotifyArtistResult {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
  followers?: number;
  popularity: number;
  verified?: boolean;
}

export type ArtistSearchState =
  | 'idle'
  | 'loading'
  | 'error'
  | 'empty'
  | 'success';

export interface UseArtistSearchQueryOptions {
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
  /** Max results to fetch (default 5) */
  limit?: number;
  /** Min query length to trigger search (default 2) */
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

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_QUERY_LENGTH = 2;

async function fetchArtistSearch(
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<SpotifyArtistResult[]> {
  const response = await fetch(
    `/api/spotify/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { signal }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const errorCode = data?.code || 'UNKNOWN';
    if (errorCode === 'RATE_LIMITED') {
      throw new Error('Too many requests. Please wait a moment.');
    }
    throw new Error(data?.error || 'Search failed');
  }

  return response.json();
}

/**
 * TanStack Query hook for artist search with debouncing.
 *
 * Benefits over the previous manual implementation:
 * - Automatic caching: Previously searched terms are instant
 * - Request deduplication: No redundant API calls
 * - Background refetching: Stale data is updated automatically
 * - Simpler code: ~100 lines less than manual implementation
 *
 * @example
 * ```tsx
 * const { results, state, search, clear } = useArtistSearchQuery();
 *
 * return (
 *   <input onChange={(e) => search(e.target.value)} />
 *   {state === 'loading' && <Spinner />}
 *   {results.map(artist => <ArtistCard key={artist.id} artist={artist} />)}
 * );
 * ```
 */
export function useArtistSearchQuery(
  options: UseArtistSearchQueryOptions = {}
): UseArtistSearchQueryReturn {
  const {
    debounceMs = PACER_TIMING.SEARCH_DEBOUNCE_MS,
    limit = DEFAULT_LIMIT,
    minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
  } = options;

  // Track current input and debounced query separately
  const [inputQuery, setInputQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Track debounce pending state
  const [isPending, setIsPending] = useState(false);

  // TanStack Pacer debouncer for updating the query key
  const asyncDebouncer = useAsyncDebouncer(
    async (searchQuery: string) => {
      setIsPending(false);
      const trimmed = searchQuery.trim();
      if (trimmed.length >= minQueryLength) {
        setDebouncedQuery(trimmed);
      } else {
        setDebouncedQuery('');
      }
    },
    { wait: debounceMs }
  );

  // TanStack Query for fetching and caching results
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
  } = useQuery<SpotifyArtistResult[]>({
    queryKey: queryKeys.spotify.artistSearch(debouncedQuery, limit),
    queryFn: ({ signal }) => fetchArtistSearch(debouncedQuery, limit, signal),
    enabled: debouncedQuery.length >= minQueryLength,
    staleTime: 1 * 60 * 1000, // 1 min
    gcTime: 10 * 60 * 1000, // 10 min
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Derive state from query status
  const state = useMemo<ArtistSearchState>(() => {
    if (!debouncedQuery || debouncedQuery.length < minQueryLength) {
      return 'idle';
    }
    if (isLoading || isFetching || isPending) {
      return 'loading';
    }
    if (queryError) {
      return 'error';
    }
    if (data?.length === 0) {
      return 'empty';
    }
    if (data && data.length > 0) {
      return 'success';
    }
    return 'idle';
  }, [
    debouncedQuery,
    minQueryLength,
    isLoading,
    isFetching,
    queryError,
    data,
    isPending,
  ]);

  const search = useCallback(
    (searchQuery: string) => {
      setInputQuery(searchQuery);
      const trimmed = searchQuery.trim();

      if (trimmed.length < minQueryLength) {
        asyncDebouncer.cancel();
        setDebouncedQuery('');
        setIsPending(false);
        return;
      }

      setIsPending(true);
      // Fire-and-forget: debouncer handles async execution internally
      asyncDebouncer.maybeExecute(searchQuery);
    },
    [asyncDebouncer, minQueryLength]
  );

  const searchImmediate = useCallback(
    (searchQuery: string) => {
      asyncDebouncer.cancel();
      setInputQuery(searchQuery);
      const trimmed = searchQuery.trim();

      if (trimmed.length < minQueryLength) {
        setDebouncedQuery('');
        return;
      }

      setDebouncedQuery(trimmed);
    },
    [asyncDebouncer, minQueryLength]
  );

  const clear = useCallback(() => {
    asyncDebouncer.cancel();
    setInputQuery('');
    setDebouncedQuery('');
    setIsPending(false);
  }, [asyncDebouncer]);

  // Extract error message from query error
  let errorMessage: string | null = null;
  if (queryError instanceof Error) {
    errorMessage = queryError.message;
  } else if (queryError) {
    errorMessage = String(queryError);
  }

  return {
    results: data ?? [],
    state,
    error: errorMessage,
    search,
    searchImmediate,
    clear,
    query: inputQuery,
    isPending,
  };
}
