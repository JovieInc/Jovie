'use client';

import { useQuery } from '@tanstack/react-query';
import { loadReleaseMatrix } from '@/app/app/(shell)/dashboard/releases/actions';
import { queryKeys, STANDARD_NO_REMOUNT_CACHE } from '@/lib/queries';

export function useReleasesQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.releases.matrix(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => loadReleaseMatrix(profileId),
    ...STANDARD_NO_REMOUNT_CACHE,
    // Keep previous data across refetches of the SAME profile to avoid
    // skeleton flash. Drop it on profile switches so users never see
    // profile A's releases under profile B's header.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === profileId ? previousData : undefined,
    enabled: Boolean(profileId),
  });
}
