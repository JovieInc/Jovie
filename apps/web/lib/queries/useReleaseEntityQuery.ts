'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadReleaseEntity } from '@/app/app/(shell)/dashboard/releases/actions';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys, STANDARD_NO_REMOUNT_CACHE } from '@/lib/queries';

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
  const cached = getCachedMatrixRelease(queryClient, profileId, releaseId);

  return useQuery({
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
}
