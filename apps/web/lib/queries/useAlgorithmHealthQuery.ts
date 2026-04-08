'use client';

import { useQuery } from '@tanstack/react-query';
import type { AlgorithmHealthReport } from '@/lib/spotify/scoring';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

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
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
