'use client';

import { useQuery } from '@tanstack/react-query';
import { FREQUENT_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export interface RecentRelease {
  id: string;
  title: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  releaseType: string;
}

interface RecentReleasesResponse {
  releases: RecentRelease[];
}

async function fetchRecentReleases(
  signal?: AbortSignal
): Promise<RecentRelease[]> {
  const response = await fetchWithTimeout<RecentReleasesResponse>(
    '/api/dashboard/recent-releases',
    { signal }
  );
  return response.releases || [];
}

/**
 * Query hook for fetching recent releases for the dashboard hero card.
 * Returns the 8 most recent releases with album art.
 */
export function useRecentReleasesQuery(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.releases.recent(profileId ?? ''),
    queryFn: ({ signal }) => fetchRecentReleases(signal),
    enabled: Boolean(profileId),
    ...FREQUENT_CACHE,
  });
}
