'use client';

/**
 * Artist Search Hook
 *
 * Provides debounced Spotify artist search functionality using TanStack Pacer
 * for world-class debouncing with proper async handling and abort controller management.
 *
 * @see https://tanstack.com/pacer
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useEffect, useRef, useState } from 'react';

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

export interface UseArtistSearchOptions {
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
  /** Max results to fetch (default 5) */
  limit?: number;
  /** Min query length to trigger search (default 2) */
  minQueryLength?: number;
}

export interface UseArtistSearchReturn {
  results: SpotifyArtistResult[];
  state: ArtistSearchState;
  error: string | null;
  /** Debounced search - call on every keystroke */
  search: (query: string) => void;
  /** Immediate search - bypasses debounce */
  searchImmediate: (query: string) => Promise<void>;
  /** Clear results and reset state */
  clear: () => void;
  /** Current query being searched */
  query: string;
  /** Whether the debounce is pending */
  isPending: boolean;
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_QUERY_LENGTH = 2;

export function useArtistSearch(
  options: UseArtistSearchOptions = {}
): UseArtistSearchReturn {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    limit = DEFAULT_LIMIT,
    minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
  } = options;

  const [results, setResults] = useState<SpotifyArtistResult[]>([]);
  const [state, setState] = useState<ArtistSearchState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Ref for abort controller
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // TanStack Pacer async debouncer for search
  const asyncDebouncer = useAsyncDebouncer(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();

      if (trimmed.length < minQueryLength) {
        setResults([]);
        setState('idle');
        setError(null);
        return;
      }

      setState('loading');
      setError(null);

      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`,
          { signal: controller.signal }
        );

        // Check if aborted
        if (controller.signal.aborted) return;

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const errorCode = data?.code || 'UNKNOWN';
          if (errorCode === 'RATE_LIMITED') {
            throw new Error('Too many requests. Please wait a moment.');
          }
          throw new Error(data?.error || 'Search failed');
        }

        const data = (await response.json()) as SpotifyArtistResult[];

        // Check if aborted after parsing
        if (controller.signal.aborted) return;

        setResults(data);
        setState(data.length === 0 ? 'empty' : 'success');
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
        setState('error');
      }
    },
    {
      wait: debounceMs,
      onError: err => {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
        setState('error');
      },
    },
    (state: AsyncDebouncerState<(searchQuery: string) => Promise<void>>) => ({
      isPending: state.isPending,
      isExecuting: state.isExecuting,
    })
  );

  const search = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);

      const trimmed = searchQuery.trim();

      // If query is too short, clear immediately
      if (trimmed.length < minQueryLength) {
        asyncDebouncer.cancel();
        abortControllerRef.current?.abort();
        setResults([]);
        setState('idle');
        setError(null);
        return;
      }

      // Set loading state immediately for UX feedback
      setState('loading');

      // Debounce the actual search
      void asyncDebouncer.maybeExecute(searchQuery);
    },
    [asyncDebouncer, minQueryLength]
  );

  const searchImmediate = useCallback(
    async (searchQuery: string) => {
      // Cancel any pending debounce
      asyncDebouncer.cancel();

      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setQuery(searchQuery);

      const trimmed = searchQuery.trim();

      if (trimmed.length < minQueryLength) {
        setResults([]);
        setState('idle');
        setError(null);
        return;
      }

      setState('loading');
      setError(null);

      try {
        const response = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`,
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return;

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const errorCode = data?.code || 'UNKNOWN';
          if (errorCode === 'RATE_LIMITED') {
            throw new Error('Too many requests. Please wait a moment.');
          }
          throw new Error(data?.error || 'Search failed');
        }

        const data = (await response.json()) as SpotifyArtistResult[];

        if (controller.signal.aborted) return;

        setResults(data);
        setState(data.length === 0 ? 'empty' : 'success');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
        setState('error');
      }
    },
    [asyncDebouncer, limit, minQueryLength]
  );

  const clear = useCallback(() => {
    // Cancel any pending operations
    asyncDebouncer.cancel();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setResults([]);
    setState('idle');
    setError(null);
    setQuery('');
  }, [asyncDebouncer]);

  return {
    results,
    state,
    error,
    search,
    searchImmediate,
    clear,
    query,
    isPending: asyncDebouncer.state.isPending || false,
  };
}
