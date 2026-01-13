'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
  DashboardAnalyticsView,
} from '@/types/analytics';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

interface DashboardAnalyticsOptions {
  /** Analytics range (1d, 7d, 30d, 90d, all). Defaults to '7d'. */
  range?: AnalyticsRange;
  /** Analytics view (traffic, engagement, etc.). Defaults to 'traffic'. */
  view?: DashboardAnalyticsView;
  /** Cache stale time in milliseconds. Defaults to 5000ms (5 seconds). */
  staleTime?: number;
  /** Whether to enable the query. Defaults to true. */
  enabled?: boolean;
}

/**
 * Fetch dashboard analytics data from the API.
 * @internal Used by useDashboardAnalyticsQuery
 */
async function fetchDashboardAnalytics(
  range: AnalyticsRange,
  view: DashboardAnalyticsView,
  signal?: AbortSignal
): Promise<DashboardAnalyticsResponse> {
  const qs = new URLSearchParams({ range, view });
  return fetchWithTimeout<DashboardAnalyticsResponse>(
    `/api/dashboard/analytics?${qs.toString()}`,
    { signal }
  );
}

/**
 * Query hook for fetching dashboard analytics data.
 *
 * Uses TanStack Query for automatic caching, request deduplication,
 * and background refetching. Replaces the legacy useDashboardAnalytics hook.
 *
 * @example
 * ```tsx
 * function DashboardAnalytics() {
 *   const { data, isLoading, error, refetch } = useDashboardAnalyticsQuery({
 *     range: '7d',
 *     view: 'traffic',
 *   });
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorBanner />;
 *   return <AnalyticsChart data={data} onRefresh={refetch} />;
 * }
 * ```
 */
export function useDashboardAnalyticsQuery({
  range = '7d',
  view = 'traffic',
  staleTime = 5000,
  enabled = true,
}: DashboardAnalyticsOptions = {}) {
  return useQuery({
    queryKey: queryKeys.dashboard.analytics(view, range),
    queryFn: ({ signal }) => fetchDashboardAnalytics(range, view, signal),
    staleTime,
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled,
  });
}
