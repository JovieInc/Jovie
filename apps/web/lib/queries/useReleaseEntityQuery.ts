'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys, STANDARD_NO_REMOUNT_CACHE } from '@/lib/queries';
import { loadReleaseEntity } from '@/lib/releases/release-matrix-loader';

interface CachedMatrixRelease {
  release: ReleaseViewModel;
  dataUpdatedAt: number;
}

function getCachedMatrixRelease(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId: string,
  releaseId: string
): CachedMatrixRelease | undefined {
  const matrixKey = queryKeys.releases.matrix(profileId);
  const release = queryClient
    .getQueryData<ReleaseViewModel[]>(matrixKey)
    ?.find(r => r.id === releaseId);
  if (!release) {
    return undefined;
  }
  const state = queryClient.getQueryState<ReleaseViewModel[]>(matrixKey);
  return {
    release,
    dataUpdatedAt: state?.dataUpdatedAt ?? 0,
  };
}

export function useReleaseEntityQuery(profileId: string, releaseId: string) {
  const queryClient = useQueryClient();
  const matrixKey = queryKeys.releases.matrix(profileId);
  const cached = getCachedMatrixRelease(queryClient, profileId, releaseId);

  // Subscribe to the matrix cache so targeted mutations (setQueryData on the
  // matrix key in useReleaseMutations) propagate here. The initialData snapshot
  // alone is not reactive — without this observer the detail view keeps
  // showing pre-mutation title/artwork while the row already shows fresh data.
  const matrixSubscription = useQuery<ReleaseViewModel[]>({
    queryKey: matrixKey,
    // Observer only: `enabled: false` means the queryFn never runs, so this
    // can never overwrite or refetch the matrix cache.
    // eslint-disable-next-line @jovie/require-abort-signal -- observer only; never fetches
    queryFn: () => Promise.reject(new Error('matrix observer has no fetcher')),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const liveRelease = matrixSubscription.data?.find(r => r.id === releaseId);

  const query = useQuery({
    queryKey: queryKeys.releases.detail(profileId, releaseId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => loadReleaseEntity({ profileId, releaseId }),
    ...STANDARD_NO_REMOUNT_CACHE,
    initialData: cached?.release,
    // Forward the matrix query's own dataUpdatedAt so STANDARD_NO_REMOUNT_CACHE's
    // staleTime applies to seeded data; otherwise TanStack treats initialData
    // as stale from t=0 and refetches the moment `enabled` flips to true.
    initialDataUpdatedAt: cached?.dataUpdatedAt,
    enabled: Boolean(profileId && releaseId) && !cached,
  });

  // Prefer the live matrix row when one is cached: it is the shared source
  // that release mutations write to. Falls back to the detail query result
  // (or its seeded initialData) for releases not present in the matrix.
  if (liveRelease !== undefined && liveRelease !== query.data) {
    return { ...query, data: liveRelease };
  }
  return query;
}
