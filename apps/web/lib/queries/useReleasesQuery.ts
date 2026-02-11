'use client';

import { useQuery } from '@tanstack/react-query';
import { loadReleaseMatrix } from '@/app/app/(shell)/dashboard/releases/actions';
import { queryKeys, STANDARD_CACHE } from '@/lib/queries';

export function useReleasesQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.releases.matrix(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => loadReleaseMatrix(profileId),
    ...STANDARD_CACHE,
    enabled: Boolean(profileId),
  });
}
