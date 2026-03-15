'use client';

import { useQuery } from '@tanstack/react-query';
import type { TrackViewModel } from '@/lib/discography/types';
import { STANDARD_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export type ReleaseTrack = Pick<
  TrackViewModel,
  | 'id'
  | 'releaseId'
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
