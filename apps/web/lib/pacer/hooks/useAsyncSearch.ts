'use client';

/**
 * Hook for debounced async search with loading states.
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAbortError, toPacerError } from '../errors';
import { executeWithRetry } from './retry';
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

  // Store callbacks in refs to avoid recreating debouncer on every render
  const searchFnRef = useRef(searchFn);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    searchFnRef.current = searchFn;
    onErrorRef.current = onError;
  }, [searchFn, onError]);

  // Shared search execution logic
  const executeSearch = useCallback(
    async (trimmedQuery: string, controller: AbortController) => {
      try {
        const searchResults = await executeWithRetry(
          () => searchFnRef.current(trimmedQuery, controller.signal),
          { maxAttempts: 3 }
        );

        if (controller.signal.aborted) {
          return;
        }

        setResults(searchResults);
        setSearchState(searchResults.length === 0 ? 'empty' : 'success');
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }

        const searchError = toPacerError(err, {
          customMessages: {
            unknown: 'Search failed',
          },
        });
        setError(searchError);
        setResults([]);
        setSearchState('error');
        onErrorRef.current?.(searchError);
      }
    },
    []
  );

  // Stabilize debouncer options to prevent recreation on every render
  const debouncerOptions = useMemo(
    () => ({
      wait,
      onError: (err: unknown) => {
        const searchError = toPacerError(err, {
          customMessages: {
            unknown: 'Search failed',
          },
        });
        setError(searchError);
        setSearchState('error');
        onErrorRef.current?.(searchError);
      },
    }),
    [wait]
  );

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

      await executeSearch(trimmed, controller);
    },
    debouncerOptions,
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

      asyncDebouncer.maybeExecute(searchQuery);
    },
    [asyncDebouncer, minQueryLength]
  );

  const searchImmediate = useCallback(
    async (searchQuery: string) => {
      setQuery(searchQuery);
      asyncDebouncer.cancel();

      const trimmed = searchQuery.trim();
      if (trimmed.length < minQueryLength) {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
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

      await executeSearch(trimmed, controller);
    },
    [asyncDebouncer, minQueryLength, executeSearch]
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

  // Cleanup on unmount - cancel both debouncer and in-flight requests
  useEffect(() => {
    return () => {
      asyncDebouncer.cancel();
      abortControllerRef.current?.abort();
    };
  }, [asyncDebouncer]);

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
