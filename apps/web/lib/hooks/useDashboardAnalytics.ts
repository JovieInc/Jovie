'use client';

/**
 * useDashboardAnalytics Hook
 *
 * Client hook for dashboard analytics that uses server actions instead of
 * direct API calls. This ensures consistent data fetching patterns per
 * Section 10.1 of agents.md - Data Fetching Strategy.
 *
 * For initial page loads, consider fetching data in a Server Component
 * and passing it as initialData to avoid the loading state.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { fetchDashboardAnalytics } from '@/lib/actions/analytics';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
  DashboardAnalyticsView,
} from '@/types/analytics';

type AnalyticsState = {
  data: DashboardAnalyticsResponse | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  lastUpdatedAt: number | null;
};

type CacheEntry = {
  data: DashboardAnalyticsResponse;
  expiresAt: number;
  lastUpdatedAt: number;
};

const DEFAULT_TTL_MS = 5_000;

/**
 * Client-side cache for analytics data
 * Keyed by view:range to prevent unnecessary server action calls
 */
const clientCache = new Map<string, CacheEntry>();

function getKeyWithView(
  range: AnalyticsRange,
  view: DashboardAnalyticsView
): string {
  return `dashboard-analytics:${view}:${range}`;
}

function isRange(value: string): value is AnalyticsRange {
  return (
    value === '1d' ||
    value === '7d' ||
    value === '30d' ||
    value === '90d' ||
    value === 'all'
  );
}

export type UseDashboardAnalyticsOptions = {
  /** Time range for analytics data */
  range?: AnalyticsRange;
  /** Analytics view type */
  view?: DashboardAnalyticsView;
  /** Cache TTL in milliseconds (default: 5000) */
  ttlMs?: number;
  /** Initial data from server component to avoid loading state */
  initialData?: DashboardAnalyticsResponse | null;
};

/**
 * Hook for fetching dashboard analytics using server actions
 *
 * @example
 * // Basic usage (will show loading state initially)
 * const { data, loading, error, refresh } = useDashboardAnalytics({
 *   range: '7d',
 *   view: 'traffic',
 * });
 *
 * @example
 * // With initial data from server component (no loading state)
 * const { data, refresh } = useDashboardAnalytics({
 *   range: '7d',
 *   view: 'traffic',
 *   initialData: serverFetchedData,
 * });
 */
export function useDashboardAnalytics(
  options: UseDashboardAnalyticsOptions = {}
) {
  const range: AnalyticsRange = useMemo(() => {
    const provided = options.range;
    if (!provided) return '7d';
    return isRange(provided) ? provided : '7d';
  }, [options.range]);

  const view: DashboardAnalyticsView = useMemo(() => {
    return options.view ?? 'traffic';
  }, [options.view]);

  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const initialData = options.initialData ?? null;

  // Use React's useTransition for non-blocking updates
  const [isPending, startTransition] = useTransition();

  const [state, setState] = useState<AnalyticsState>(() => {
    // If initial data is provided, use it immediately
    if (initialData) {
      const key = getKeyWithView(range, view);
      const now = Date.now();
      clientCache.set(key, {
        data: initialData,
        expiresAt: now + ttlMs,
        lastUpdatedAt: now,
      });
      return {
        data: initialData,
        error: null,
        loading: false,
        refreshing: false,
        lastUpdatedAt: now,
      };
    }

    return {
      data: null,
      error: null,
      loading: true,
      refreshing: false,
      lastUpdatedAt: null,
    };
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (forceRefresh: boolean) => {
      const key = getKeyWithView(range, view);
      const now = Date.now();
      const cached = clientCache.get(key);

      // Return cached data if valid and not forcing refresh
      if (!forceRefresh && cached && cached.expiresAt > now) {
        setState(prev => ({
          ...prev,
          data: cached.data,
          error: null,
          loading: false,
          refreshing: false,
          lastUpdatedAt: cached.lastUpdatedAt,
        }));
        return;
      }

      // Show stale data while refreshing in background
      if (!forceRefresh && cached) {
        setState(prev => ({
          ...prev,
          data: cached.data,
          error: null,
          loading: false,
          refreshing: true,
          lastUpdatedAt: cached.lastUpdatedAt,
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: null,
          loading: prev.data ? false : true,
          refreshing: Boolean(prev.data),
        }));
      }

      try {
        // Use server action instead of fetch
        const result = await fetchDashboardAnalytics(range, view);

        if (!mountedRef.current) return;

        if (result.success) {
          const updatedAt = Date.now();
          clientCache.set(key, {
            data: result.data,
            expiresAt: updatedAt + ttlMs,
            lastUpdatedAt: updatedAt,
          });

          setState({
            data: result.data,
            error: null,
            loading: false,
            refreshing: false,
            lastUpdatedAt: updatedAt,
          });
        } else {
          setState(prev => ({
            ...prev,
            error: result.error,
            loading: false,
            refreshing: false,
          }));
        }
      } catch (error) {
        if (!mountedRef.current) return;

        const message =
          error instanceof Error ? error.message : 'Unable to load analytics';
        setState(prev => ({
          ...prev,
          error: message,
          loading: false,
          refreshing: false,
        }));
      }
    },
    [range, ttlMs, view]
  );

  // Initial load
  useEffect(() => {
    // Skip initial load if we have initialData
    if (options.initialData) return;

    void load(false);
  }, [load, options.initialData]);

  const refresh = useCallback(async () => {
    // Use startTransition for non-blocking refresh
    startTransition(() => {
      void load(true);
    });
  }, [load]);

  return {
    range,
    data: state.data,
    error: state.error,
    loading: state.loading,
    refreshing: state.refreshing || isPending,
    lastUpdatedAt: state.lastUpdatedAt,
    refresh,
  };
}
