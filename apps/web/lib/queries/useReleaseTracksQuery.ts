'use client';

import { type QueryClient, useQuery } from '@tanstack/react-query';
import type { TrackViewModel } from '@/lib/discography/types';
import { STANDARD_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export type ReleaseTrack = Pick<
  TrackViewModel,
  | 'id'
  | 'releaseId'
  | 'releaseSlug'
  | 'title'
  | 'slug'
  | 'smartLinkPath'
  | 'trackNumber'
  | 'discNumber'
  | 'durationMs'
  | 'isrc'
  | 'isExplicit'
  | 'previewUrl'
  | 'audioUrl'
  | 'audioFormat'
  | 'previewSource'
  | 'previewVerification'
  | 'providerConfidenceSummary'
  | 'providers'
>;

async function fetchReleaseTracks(
  releaseId: string,
  signal?: AbortSignal
): Promise<ReleaseTrack[]> {
  return fetchWithTimeout<ReleaseTrack[]>(
    `/api/dashboard/releases/${encodeURIComponent(releaseId)}/tracks`,
    { signal }
  );
}

export function useReleaseTracksQuery(releaseId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.releases.tracks(releaseId),
    queryFn: ({ signal }) => fetchReleaseTracks(releaseId, signal),
    ...STANDARD_CACHE,
    enabled: enabled && Boolean(releaseId),
    retry: 1,
  });
}

/**
 * Intent-driven prefetch for the release track list.
 *
 * Call on genuine row intent (pointer enter / keyboard focus) so opening the
 * release detail sidebar does not waterfall the tracks request behind the
 * drawer mount. Shares the same query key, fetcher, and cache strategy as
 * `useReleaseTracksQuery`, so TanStack dedupes repeat intent and in-flight
 * requests. `prefetchQuery` never rejects — a failed or aborted prefetch
 * leaves the sidebar's normal fetch path untouched.
 */
export function prefetchReleaseTracks(
  queryClient: QueryClient,
  releaseId: string
) {
  if (!releaseId) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: queryKeys.releases.tracks(releaseId),
    queryFn: ({ signal }) => fetchReleaseTracks(releaseId, signal),
    ...STANDARD_CACHE,
  });
}
