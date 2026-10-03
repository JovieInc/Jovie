'use client';

import { useQuery } from '@tanstack/react-query';
import type { OvieInboxResponse } from '@/lib/ovie/inbox';
import { FREQUENT_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export const OVIE_INBOX_URL = '/api/ovie/inbox';

/**
 * One cache for the Inbox page and the nav badge, so a decision on the page
 * updates the count without a second request.
 */
export function useOvieInboxQuery(
  options: {
    readonly initialData?: OvieInboxResponse;
    readonly enabled?: boolean;
  } = {}
) {
  return useQuery({
    queryKey: queryKeys.ovieInbox.all,
    queryFn: ({ signal }) =>
      fetchWithTimeout<OvieInboxResponse>(OVIE_INBOX_URL, { signal }),
    ...FREQUENT_CACHE,
    initialData: options.initialData,
    initialDataUpdatedAt: options.initialData
      ? Date.parse(options.initialData.fetchedAt)
      : undefined,
    enabled: options.enabled ?? true,
    refetchInterval: 60 * 1000,
    retry: 1,
  });
}
