'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProfileMonetizationSummaryResponse } from '@/lib/profile-monetization';
import { STANDARD_NO_REMOUNT_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

async function fetchProfileMonetizationSummary(
  signal?: AbortSignal
): Promise<ProfileMonetizationSummaryResponse> {
  return fetchWithTimeout<ProfileMonetizationSummaryResponse>(
    '/api/dashboard/monetization-summary',
    { signal }
  );
}

export function useProfileMonetizationSummary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.monetizationSummary(),
    queryFn: ({ signal }) => fetchProfileMonetizationSummary(signal),
    enabled,
    ...STANDARD_NO_REMOUNT_CACHE,
  });
}
