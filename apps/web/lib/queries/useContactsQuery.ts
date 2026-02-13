'use client';

import { useQuery } from '@tanstack/react-query';
import { getProfileContactsForOwner } from '@/app/app/(shell)/dashboard/contacts/actions';
import type { DashboardContact } from '@/types/contacts';
import { STANDARD_CACHE } from './cache-strategies';
import { queryKeys } from './keys';

export function useContactsQuery(profileId: string) {
  return useQuery<DashboardContact[]>({
    queryKey: queryKeys.contacts.list(profileId),
    queryFn: ({ signal: _signal }) => getProfileContactsForOwner(profileId),
    enabled: !!profileId,
    ...STANDARD_CACHE,
  });
}
