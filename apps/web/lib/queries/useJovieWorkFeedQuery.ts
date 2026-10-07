'use client';

import { useQuery } from '@tanstack/react-query';
import type { ActivityRange } from '@/features/dashboard/organisms/dashboard-activity-feed/types';
import {
  type JovieWorkItem,
  parseJovieWorkFeedResponse,
} from '@/lib/activity/jovie-work-feed';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

interface JovieWorkFeedOptions {
  readonly profileId: string;
  readonly range?: ActivityRange;
  readonly completedOnly?: boolean;
  readonly enabled?: boolean;
}

async function fetchJovieWorkFeed(
  profileId: string,
  completedOnly: boolean,
  range: ActivityRange,
  signal?: AbortSignal
): Promise<JovieWorkItem[]> {
  const params = new URLSearchParams({
    profileId,
    range,
    ...(completedOnly ? { phase: 'completed' } : {}),
  });

  const response = await fetchWithTimeout<unknown>(
    `/api/dashboard/jovie-work/recent?${params.toString()}`,
    { signal, cache: 'no-store' }
  );

  return parseJovieWorkFeedResponse(response);
}

export function useJovieWorkFeedQuery({
  profileId,
  range = '7d',
  enabled = true,
  completedOnly = false,
}: JovieWorkFeedOptions) {
  return useQuery({
    queryKey: completedOnly
      ? [
          ...queryKeys.dashboard.jovieWorkFeed(profileId, range),
          { completedOnly },
        ]
      : queryKeys.dashboard.jovieWorkFeed(profileId, range),
    queryFn: ({ signal }) =>
      fetchJovieWorkFeed(profileId, completedOnly, range, signal),
    enabled: enabled && profileId.length > 0,
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
}
