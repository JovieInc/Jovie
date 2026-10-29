'use client';

import { useQuery } from '@tanstack/react-query';
import {
  TIME_LEVERAGE_API,
  timeLeverageSchema,
} from '@/lib/ovie/time-leverage';
import { FREQUENT_CACHE, RETRY_BACKOFF } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export function useTimeLeverageQuery(isAdmin: boolean) {
  return useQuery({
    ...FREQUENT_CACHE,
    ...RETRY_BACKOFF,
    queryKey: queryKeys.hud.timeLeverage(),
    queryFn: ({ signal }) =>
      fetchWithTimeout(TIME_LEVERAGE_API, {
        signal,
        cache: 'no-store',
        schema: timeLeverageSchema.nullable(),
      }),
    enabled: isAdmin,
    refetchInterval: 10 * 60_000,
    refetchIntervalInBackground: false,
  });
}
