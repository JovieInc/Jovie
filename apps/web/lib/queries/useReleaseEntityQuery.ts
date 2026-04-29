'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadReleaseEntity } from '@/app/app/(shell)/dashboard/releases/actions';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys, STANDARD_NO_REMOUNT_CACHE } from '@/lib/queries';

function getCachedMatrixRelease(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId: string,
  releaseId: string
): ReleaseViewModel | undefined {
  return queryClient
    .getQueryData<ReleaseViewModel[]>(queryKeys.releases.matrix(profileId))
    ?.find(release => release.id === releaseId);
}

export function useReleaseEntityQuery(profileId: string, releaseId: string) {
  const queryClient = useQueryClient();
  const cachedRelease = getCachedMatrixRelease(
    queryClient,
    profileId,
    releaseId
  );

  return useQuery({
    queryKey: queryKeys.releases.detail(profileId, releaseId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => loadReleaseEntity({ profileId, releaseId }),
    ...STANDARD_NO_REMOUNT_CACHE,
    initialData: cachedRelease,
    enabled: Boolean(profileId && releaseId) && !cachedRelease,
  });
}
