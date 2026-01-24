'use client';

import { useQuery } from '@tanstack/react-query';
import { loadReleaseMatrix } from '@/app/app/dashboard/releases/actions';
import { queryKeys, STANDARD_CACHE } from '@/lib/queries';

export function useReleasesQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.releases.matrix(profileId),
    queryFn: () => loadReleaseMatrix(),
    ...STANDARD_CACHE,
    enabled: Boolean(profileId),
  });
}
