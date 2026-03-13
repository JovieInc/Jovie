'use client';

import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { PACER_TIMING } from '@/lib/pacer/hooks';
import { SEARCH_CACHE } from './cache-strategies';
import { FetchError } from './fetch';

export type ArtistSearchState =
  | 'idle'
  | 'loading'
  | 'error'
  | 'empty'
  | 'success';

interface UseUnifiedArtistSearchQueryOptions<TResult> {
  debounceMs?: number;
  limit?: number;
  minQueryLength?: number;
  queryKey: (query: string, limit: number) => readonly unknown[];
  searchFn: (
    query: string,
    limit: number,
    signal?: AbortSignal
  ) => Promise<TResult[]>;
  shouldBypassDebounce?: (query: string) => boolean;
}

interface UseUnifiedArtistSearchQueryReturn<TResult> {
  results: TResult[];
  state: ArtistSearchState;
  error: string | null;
  search: (query: string) => void;
  searchImmediate: (query: string) => void;
  clear: () => void;
  query: string;
  isPending: boolean;
}

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_QUERY_LENGTH = 1;

export function useUnifiedArtistSearchQuery<TResult>(
  options: UseUnifiedArtistSearchQueryOptions<TResult>
): UseUnifiedArtistSearchQueryReturn<TResult> {
  const {
    debounceMs = PACER_TIMING.SEARCH_DEBOUNCE_MS,
    limit = DEFAULT_LIMIT,
    minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
    queryKey,
    searchFn,
    shouldBypassDebounce,
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
  } = useQuery<TResult[]>({
    queryKey: queryKey(debouncedQuery, limit),
    queryFn: ({ signal }) => searchFn(debouncedQuery, limit, signal),
    enabled: debouncedQuery.length >= minQueryLength,
    ...SEARCH_CACHE,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.name === 'RateLimitError') {
        return false;
      }
      if (error instanceof FetchError && !error.isRetryable()) {
        return false;
      }
      return failureCount < 2;
    },
  });

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

      if (shouldBypassDebounce?.(trimmed)) {
        asyncDebouncer.cancel();
        setDebouncedQuery(trimmed);
        setIsPending(false);
        return;
      }

      setIsPending(true);
      asyncDebouncer.maybeExecute(searchQuery);
    },
    [asyncDebouncer, minQueryLength, shouldBypassDebounce]
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
