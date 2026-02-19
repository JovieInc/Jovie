'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type BandsintownConnectionStatus,
  checkBandsintownConnection,
} from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { STANDARD_CACHE } from './cache-strategies';
import { queryKeys } from './keys';

export function useBandsintownConnectionQuery(profileId: string) {
  return useQuery<BandsintownConnectionStatus>({
    queryKey: queryKeys.tourDates.connection(profileId),
    queryFn: ({ signal: _signal }) => checkBandsintownConnection(),
    enabled: !!profileId,
    ...STANDARD_CACHE,
  });
}
