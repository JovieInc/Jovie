'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  Activity,
  ActivityRange,
} from '@/components/dashboard/organisms/dashboard-activity-feed/types';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

interface ActivityFeedOptions {
  /** Profile ID to fetch activity for */
  profileId: string;
  /** Time range for activity (7d, 30d, etc.) */
  range: ActivityRange;
  /** Whether to enable the query. Defaults to true. */
  enabled?: boolean;
}

interface ActivityFeedResponse {
  activities: Activity[];
}

/**
 * Fetch activity feed data from the API.
 * @internal Used by useActivityFeedQuery
 */
async function fetchActivityFeed(
  profileId: string,
  range: ActivityRange,
  signal?: AbortSignal
): Promise<Activity[]> {
  const params = new URLSearchParams({
    profileId: encodeURIComponent(profileId),
    range: encodeURIComponent(range),
  });

  const response = await fetchWithTimeout<ActivityFeedResponse>(
    `/api/dashboard/activity/recent?${params.toString()}`,
    { signal }
  );

  return response.activities ?? [];
}

/**
 * Query hook for fetching dashboard activity feed data.
 *
 * Uses TanStack Query for automatic caching, request deduplication,
 * and automatic polling every 5 minutes. Replaces the legacy useActivityFeed hook.
 *
 * Features:
 * - Automatic polling every 5 minutes (only when tab is active)
 * - Feature gate integration (AUDIENCE_V2)
 * - Automatic abort controller management
 * - Background refetching
 *
 * @example
 * ```tsx
 * function DashboardActivityFeed() {
 *   const { data: activities, isLoading, error } = useActivityFeedQuery({
 *     profileId: 'profile-123',
 *     range: '7d',
 *   });
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorBanner />;
 *   return <ActivityList activities={activities} />;
 * }
 * ```
 */
export function useActivityFeedQuery({
  profileId,
  range,
  enabled = true,
}: ActivityFeedOptions) {
  const gate = useFeatureGate(STATSIG_FLAGS.AUDIENCE_V2);

  return useQuery({
    queryKey: queryKeys.dashboard.activityFeed(profileId, range),
    queryFn: ({ signal }) => fetchActivityFeed(profileId, range, signal),
    enabled: gate && enabled,
    staleTime: 60_000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes (matches legacy polling)
    refetchIntervalInBackground: false, // Only poll when tab is active
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
