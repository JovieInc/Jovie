'use client';

import { useQuery } from '@tanstack/react-query';
import { loadDspPresenceForProfile } from '@/app/app/(shell)/dashboard/presence/actions';
import { queryKeys, STANDARD_CACHE } from '@/lib/queries';

export function useDspPresenceQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.dspEnrichment.presence(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => loadDspPresenceForProfile(profileId),
    ...STANDARD_CACHE,
    enabled: Boolean(profileId),
  });
}
