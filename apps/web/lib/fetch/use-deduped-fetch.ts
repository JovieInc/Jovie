'use client';

/**
 * React Hook for Deduplicated Fetching
 *
 * Provides SWR-like data fetching with automatic request deduplication,
 * caching, and state management. Multiple components using the same
 * URL will share requests and cache.
 *
 * @example
 * ```tsx
 * function BillingStatus() {
 *   const { data, loading, error, refresh } = useDedupedFetch<BillingInfo>(
 *     '/api/billing/status',
 *     { ttlMs: 10000 }
 *   );
 *
 *   if (loading) return <Skeleton />;
 *   if (error) return <ErrorMessage error={error} onRetry={refresh} />;
 *   return <BillingCard data={data} />;
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DedupedFetchOptions,
  dedupedFetchWithMeta,
  FetchError,
  invalidateCache,
} from './deduped-fetch';

/**
 * Check if an error is an abort error that should be ignored.
 */
function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'AbortError' ||
    (error as DOMException).code === DOMException.ABORT_ERR
  );
}

/**
 * State returned by useDedupedFetch
 */
export interface UseDedupedFetchState<T> {
  /** The fetched data (null until first successful fetch) */
  data: T | null;
  /** Whether the initial fetch is in progress */
  loading: boolean;
  /** Whether a refresh/revalidation is in progress */
  refreshing: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** HTTP status code if fetch failed with FetchError */
  errorStatus: number | null;
  /** Timestamp of last successful fetch */
  lastFetchedAt: number | null;
  /** Whether the current data came from cache */
  fromCache: boolean;
}

/**
 * Actions returned by useDedupedFetch
 */
export interface UseDedupedFetchActions {
  /** Manually refresh the data (bypasses cache) */
  refresh: () => Promise<void>;
  /** Invalidate the cache entry (data will be refetched on next access) */
  invalidate: () => void;
  /** Manually set the data */
  setData: <T>(data: T | null) => void;
}

/**
 * Combined return type for useDedupedFetch
 */
export type UseDedupedFetchReturn<T> = UseDedupedFetchState<T> &
  UseDedupedFetchActions;

/**
 * Options for useDedupedFetch hook
 */
export interface UseDedupedFetchHookOptions
  extends Omit<DedupedFetchOptions, 'forceRefresh'> {
  /** Skip fetching (useful for conditional fetches) */
  skip?: boolean;
  /** Callback when fetch completes successfully */
  onSuccess?: <T>(data: T) => void;
  /** Callback when fetch fails */
  onError?: (error: Error) => void;
  /** Polling interval in milliseconds (0 to disable) */
  pollingIntervalMs?: number;
  /** Initial data to use before first fetch */
  initialData?: unknown;
}

/**
 * React hook for deduplicated data fetching
 *
 * Features:
 * - Automatic request deduplication across components
 * - TTL-based response caching
 * - Loading and error states
 * - Manual refresh capability
 * - Optional polling
 * - Abort on unmount
 *
 * @param url - The URL to fetch (or null to skip)
 * @param options - Hook configuration options
 * @returns State and actions for the fetch
 */
export function useDedupedFetch<T = unknown>(
  url: string | null,
  options: UseDedupedFetchHookOptions = {}
): UseDedupedFetchReturn<T> {
  const {
    skip = false,
    onSuccess,
    onError,
    pollingIntervalMs = 0,
    initialData,
    ...fetchOptions
  } = options;

  const [state, setState] = useState<UseDedupedFetchState<T>>({
    data: (initialData as T) ?? null,
    loading: !skip && url !== null && !initialData,
    refreshing: false,
    error: null,
    errorStatus: null,
    lastFetchedAt: null,
    fromCache: false,
  });

  // Refs for cleanup and tracking
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchOptionsRef = useRef(fetchOptions);

  // Store callbacks in refs to avoid re-running effect
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  useEffect(() => {
    fetchOptionsRef.current = fetchOptions;
  }, [fetchOptions]);

  // Core fetch function
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!url || skip) return;

      // Abort any existing request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Set loading state
      setState(prev => ({
        ...prev,
        loading: prev.data === null && !forceRefresh,
        refreshing: prev.data !== null || forceRefresh,
        error: null,
        errorStatus: null,
      }));

      try {
        const result = await dedupedFetchWithMeta<T>(url, {
          ...fetchOptionsRef.current,
          forceRefresh,
          signal: controller.signal,
        });

        // Only update state if still mounted
        if (mountedRef.current && !controller.signal.aborted) {
          setState({
            data: result.data,
            loading: false,
            refreshing: false,
            error: null,
            errorStatus: null,
            lastFetchedAt: result.fetchedAt,
            fromCache: result.fromCache,
          });

          onSuccessRef.current?.(result.data);
        }
      } catch (error) {
        // Ignore abort errors
        if (isAbortError(error)) return;

        if (!mountedRef.current || controller.signal.aborted) return;

        const errorMessage =
          error instanceof Error ? error.message : 'An error occurred';
        const errorStatus = error instanceof FetchError ? error.status : null;

        setState(prev => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: errorMessage,
          errorStatus,
        }));

        onErrorRef.current?.(
          error instanceof Error ? error : new Error(errorMessage)
        );
      }
    },
    [url, skip]
  );

  // Initial fetch on mount/URL change
  useEffect(() => {
    mountedRef.current = true;

    if (url && !skip) {
      void fetchData(false);
    }

    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, [url, skip, fetchData]);

  // Polling effect
  useEffect(() => {
    if (!url || skip || pollingIntervalMs <= 0) {
      return;
    }

    const poll = () => {
      if (mountedRef.current) {
        void fetchData(true);
        pollingTimeoutRef.current = setTimeout(poll, pollingIntervalMs);
      }
    };

    pollingTimeoutRef.current = setTimeout(poll, pollingIntervalMs);

    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, [url, skip, pollingIntervalMs, fetchData]);

  // Manual refresh action
  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // Invalidate cache action
  const invalidate = useCallback(() => {
    if (url) {
      invalidateCache(url);
    }
  }, [url]);

  // Manual data setter
  const setData = useCallback(<D>(data: D | null) => {
    setState(prev => ({
      ...prev,
      data: data as unknown as T | null,
    }));
  }, []);

  return {
    ...state,
    refresh,
    invalidate,
    setData,
  };
}

/**
 * Fetch multiple URLs in parallel with deduplication
 *
 * @example
 * ```tsx
 * const { data, loading, errors } = useDedupedFetchAll([
 *   '/api/billing/status',
 *   '/api/stripe/pricing-options',
 * ]);
 *
 * const [billingStatus, pricingOptions] = data;
 * ```
 */
export function useDedupedFetchAll<T extends unknown[] = unknown[]>(
  urls: (string | null)[],
  options: Omit<UseDedupedFetchHookOptions, 'initialData'> = {}
): {
  data: { [K in keyof T]: T[K] | null };
  loading: boolean;
  errors: (string | null)[];
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<{
    data: (unknown | null)[];
    loading: boolean;
    errors: (string | null)[];
  }>({
    data: urls.map(() => null),
    loading: !options.skip && urls.some(url => url !== null),
    errors: urls.map(() => null),
  });

  const { skip = false, ...fetchOptions } = options;

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(
    async (forceRefresh = false) => {
      if (skip || urls.every(url => url === null)) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setState(prev => ({
        ...prev,
        loading: true,
        errors: urls.map(() => null),
      }));

      const results = await Promise.allSettled(
        urls.map(async url => {
          if (url === null) return null;
          const result = await dedupedFetchWithMeta(url, {
            ...fetchOptions,
            forceRefresh,
            signal: controller.signal,
          });
          return result.data;
        })
      );

      if (mountedRef.current && !controller.signal.aborted) {
        const data = results.map(r =>
          r.status === 'fulfilled' ? r.value : null
        );
        const errors = results.map(r =>
          r.status === 'rejected'
            ? r.reason instanceof Error
              ? r.reason.message
              : 'Unknown error'
            : null
        );

        setState({
          data,
          loading: false,
          errors,
        });
      }
    },
    [urls, skip, fetchOptions]
  );

  useEffect(() => {
    mountedRef.current = true;
    void fetchAll(false);

    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [fetchAll]);

  const refresh = useCallback(async () => {
    await fetchAll(true);
  }, [fetchAll]);

  return {
    data: state.data as { [K in keyof T]: T[K] | null },
    loading: state.loading,
    errors: state.errors,
    refresh,
  };
}
