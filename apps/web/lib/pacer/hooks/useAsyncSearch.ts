'use client';

/**
 * Hook for debounced async search with loading states.
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '../errors';
import { PACER_TIMING } from './timing';

export interface UseAsyncSearchOptions<TResult> {
  /** The async search function */
  searchFn: (query: string, signal: AbortSignal) => Promise<TResult[]>;
  /** Debounce wait time in ms */
  wait?: number;
  /** Minimum query length to trigger search */
  minQueryLength?: number;
  /** Callback on search error */
  onError?: (error: Error) => void;
}

export interface UseAsyncSearchReturn<TResult> {
  /** Trigger search for a query */
  search: (query: string) => void;
  /** Search immediately (bypasses debounce) */
  searchImmediate: (query: string) => Promise<void>;
  /** Clear results and reset state */
  clear: () => void;
  /** Current search results */
  results: TResult[];
  /** Whether search is executing */
  isSearching: boolean;
  /** Whether debounce is pending */
  isPending: boolean;
  /** Current search query */
  query: string;
  /** Search error if any */
  error: Error | null;
  /** Search state */
  state: 'idle' | 'loading' | 'error' | 'empty' | 'success';
}

/**
 * @example
 * ```tsx
 * const { search, results, isSearching, isPending, error, clear } = useAsyncSearch({
 *   searchFn: async (query, signal) => {
 *     const response = await fetch(`/api/search?q=${query}`, { signal });
 *     return response.json();
 *   },
 *   wait: 300,
 *   minQueryLength: 2,
 * });
 * ```
 */
export function useAsyncSearch<TResult>({
  searchFn,
  wait = PACER_TIMING.SEARCH_DEBOUNCE_MS,
  minQueryLength = 2,
  onError,
}: UseAsyncSearchOptions<TResult>): UseAsyncSearchReturn<TResult> {
  const [results, setResults] = useState<TResult[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [searchState, setSearchState] = useState<
    'idle' | 'loading' | 'error' | 'empty' | 'success'
  >('idle');
  const abortControllerRef = useRef<AbortController | null>(null);

  const asyncDebouncer = useAsyncDebouncer(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();

      if (trimmed.length < minQueryLength) {
        setResults([]);
        setSearchState('idle');
        setError(null);
        return;
      }

      setSearchState('loading');
      setError(null);

      // Cancel any previous request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const searchResults = await searchFn(trimmed, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setResults(searchResults);
        setSearchState(searchResults.length === 0 ? 'empty' : 'success');
      } catch (err) {
        // Use standardized error check
        if (isAbortError(err)) {
          return;
        }

        const searchError =
          err instanceof Error ? err : new Error('Search failed');
        setError(searchError);
        setResults([]);
        setSearchState('error');
        onError?.(searchError);
      }
    },
    {
      wait,
      onError: err => {
        const searchError =
          err instanceof Error ? err : new Error('Search failed');
        setError(searchError);
        setSearchState('error');
        onError?.(searchError);
      },
    },
    (state: AsyncDebouncerState<(searchQuery: string) => Promise<void>>) => ({
      isExecuting: state.isExecuting,
      isPending: state.isPending,
    })
  );

  const search = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);

      const trimmed = searchQuery.trim();
      if (trimmed.length < minQueryLength) {
        // Cancel any pending debounced work and in-flight requests
        asyncDebouncer.cancel();
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setResults([]);
        setSearchState('idle');
        setError(null);
        return;
      }

      // Show loading state immediately for UX feedback
      setSearchState('loading');

      void asyncDebouncer.maybeExecute(searchQuery);
    },
    [asyncDebouncer, minQueryLength]
  );

  const searchImmediate = useCallback(
    async (searchQuery: string) => {
      setQuery(searchQuery);
      asyncDebouncer.cancel();

      const trimmed = searchQuery.trim();
      if (trimmed.length < minQueryLength) {
        setResults([]);
        setSearchState('idle');
        setError(null);
        return;
      }

      setSearchState('loading');

      // Cancel any previous request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const searchResults = await searchFn(trimmed, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setResults(searchResults);
        setSearchState(searchResults.length === 0 ? 'empty' : 'success');
      } catch (err) {
        // Use standardized error check
        if (isAbortError(err)) {
          return;
        }

        const searchError =
          err instanceof Error ? err : new Error('Search failed');
        setError(searchError);
        setResults([]);
        setSearchState('error');
        onError?.(searchError);
      }
    },
    [asyncDebouncer, minQueryLength, searchFn, onError]
  );

  const clear = useCallback(() => {
    asyncDebouncer.cancel();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResults([]);
    setSearchState('idle');
    setError(null);
    setQuery('');
  }, [asyncDebouncer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    search,
    searchImmediate,
    clear,
    results,
    isSearching: asyncDebouncer.state.isExecuting || false,
    isPending: asyncDebouncer.state.isPending || false,
    query,
    error,
    state: searchState,
  };
}
