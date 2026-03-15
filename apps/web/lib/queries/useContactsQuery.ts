'use client';

import { useQuery } from '@tanstack/react-query';
import type { DashboardContact } from '@/types/contacts';
import { STANDARD_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

async function fetchContacts(
  profileId: string,
  signal?: AbortSignal
): Promise<DashboardContact[]> {
  return fetchWithTimeout<DashboardContact[]>(
    `/api/dashboard/contacts?profileId=${encodeURIComponent(profileId)}`,
    { signal }
  );
}

export function useContactsQuery(profileId: string) {
  return useQuery<DashboardContact[]>({
    queryKey: queryKeys.contacts.list(profileId),
    queryFn: ({ signal }) => fetchContacts(profileId, signal),
    enabled: !!profileId,
    ...STANDARD_CACHE,
  });
}
