'use client';

/**
 * Apple Music Artist Search Query Hook
 *
 * TanStack Query-based artist search for Apple Music with debouncing.
 * Mirrors useArtistSearchQuery but targets the Apple Music search API.
 */

import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { PACER_TIMING } from '@/lib/pacer/hooks';
import { SEARCH_CACHE } from './cache-strategies';
import { queryKeys } from './keys';

export interface AppleMusicArtistResult {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
  genres?: string[];
}

export type AppleMusicSearchState =
  | 'idle'
  | 'loading'
  | 'error'
  | 'empty'
  | 'success';

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

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_QUERY_LENGTH = 2;

async function fetchAppleMusicArtistSearch(
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<AppleMusicArtistResult[]> {
  const response = await fetch(
    `/api/apple-music/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { signal }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const errorCode = data?.code || 'UNKNOWN';
    if (errorCode === 'RATE_LIMITED') {
      throw new RangeError('Too many requests. Please wait a moment.');
    }
    throw new Error(data?.error || 'Search failed');
  }

  return response.json();
}

export function useAppleMusicArtistSearchQuery(
  options: UseAppleMusicArtistSearchQueryOptions = {}
): UseAppleMusicArtistSearchQueryReturn {
  const {
    debounceMs = PACER_TIMING.SEARCH_DEBOUNCE_MS,
    limit = DEFAULT_LIMIT,
    minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
  } = options;

  const [inputQuery, setInputQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isPending, setIsPending] = useState(false);

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

  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
  } = useQuery<AppleMusicArtistResult[]>({
    queryKey: queryKeys.appleMusic.artistSearch(debouncedQuery, limit),
    queryFn: ({ signal }) =>
      fetchAppleMusicArtistSearch(debouncedQuery, limit, signal),
    enabled: debouncedQuery.length >= minQueryLength,
    ...SEARCH_CACHE,
  });

  const state = useMemo<AppleMusicSearchState>(() => {
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
