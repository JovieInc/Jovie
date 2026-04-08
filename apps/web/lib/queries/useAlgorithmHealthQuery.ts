'use client';

import { useQuery } from '@tanstack/react-query';
import type { AlgorithmHealthReport } from '@/lib/spotify/scoring';
import { FREQUENT_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

const UNAVAILABLE_STALE_TIME = 10 * 1000;
const HEALTHY_STALE_TIME = 60 * 1000;

async function fetchAlgorithmHealth(
  artistId: string,
  signal?: AbortSignal
): Promise<AlgorithmHealthReport> {
  return fetchWithTimeout<AlgorithmHealthReport>(
    `/api/spotify/fal-analysis?artistId=${encodeURIComponent(artistId)}`,
    {
      signal,
      cache: 'no-store',
    }
  );
}

export function useAlgorithmHealthQuery(
  artistId: string | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: queryKeys.spotify.falAnalysis(artistId ?? ''),
    queryFn: ({ signal }) => {
      if (!artistId) {
        throw new Error('Spotify artist ID required');
      }

      return fetchAlgorithmHealth(artistId, signal);
    },
    enabled: enabled && artistId !== null,
    ...FREQUENT_CACHE,
    staleTime: query =>
      query.state.data?.status === 'unavailable'
        ? UNAVAILABLE_STALE_TIME
        : HEALTHY_STALE_TIME,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
