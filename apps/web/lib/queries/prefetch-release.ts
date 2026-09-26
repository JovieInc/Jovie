import type { QueryClient } from '@tanstack/react-query';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { STANDARD_CACHE } from './cache-strategies';
import { queryKeys } from './keys';
import { fetchReleaseTracks } from './useReleaseTracksQuery';

/**
 * Intent-driven prefetch for the release detail drawer.
 *
 * The drawer seeds its entity data from the matrix cache via
 * `useReleaseEntityQuery`'s initialData, so the track list is the only cold
 * fetch on open. Call this on genuine pointer-hover or keyboard-focus intent
 * (never on mount — that would issue one request per row in long lists).
 * TanStack dedupes repeat prefetches inside `STANDARD_CACHE.staleTime`, so
 * rapid hover/focus churn does not fan out requests. Touch entry is covered
 * by the drawer's own fetch — no hover exists there.
 */
export function prefetchReleaseDetailData(
  queryClient: QueryClient,
  release: Pick<ReleaseViewModel, 'id' | 'profileId' | 'totalTracks'>
): void {
  if (!release.id || !release.profileId) return;
  if (release.totalTracks <= 0) return;

  void queryClient.prefetchQuery({
    queryKey: queryKeys.releases.tracks(release.id),
    queryFn: ({ signal }) => fetchReleaseTracks(release.id, signal),
    staleTime: STANDARD_CACHE.staleTime,
  });
}
