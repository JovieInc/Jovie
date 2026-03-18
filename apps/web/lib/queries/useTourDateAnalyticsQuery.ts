'use client';

import { useQuery } from '@tanstack/react-query';
import type { TourDateAnalyticsData } from '@/types/analytics';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

interface UseTourDateAnalyticsQueryOptions {
  tourDateId: string | null;
  enabled?: boolean;
}

async function fetchTourDateAnalytics(
  tourDateId: string,
  signal?: AbortSignal
): Promise<TourDateAnalyticsData> {
  return fetchWithTimeout<TourDateAnalyticsData>(
    `/api/dashboard/tour-dates/${tourDateId}/analytics`,
    { signal }
  );
}

export function useTourDateAnalyticsQuery({
  tourDateId,
  enabled = true,
}: UseTourDateAnalyticsQueryOptions) {
  return useQuery({
    queryKey: queryKeys.tourDates.analytics(tourDateId ?? ''),
    queryFn: ({ signal }) => fetchTourDateAnalytics(tourDateId!, signal),
    enabled: enabled && Boolean(tourDateId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
