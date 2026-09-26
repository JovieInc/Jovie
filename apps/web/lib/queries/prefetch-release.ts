import type { QueryClient } from '@tanstack/react-query';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { STANDARD_CACHE } from './cache-strategies';
import { queryKeys } from './keys';
import { fetchReleaseTracks } from './useReleaseTracksQuery';

/**
 * Warm the drawer's only cold fetch (the track list) on real hover/focus
 * intent — never on mount. TanStack dedupes within `STANDARD_CACHE.staleTime`.
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
