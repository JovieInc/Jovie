'use client';

import { useQuery } from '@tanstack/react-query';
import type { UsageSummaryData } from '@/lib/usage/limits';
import { FREQUENT_BACKGROUND_CACHE } from './cache-strategies';
import { createQueryFn, FetchError } from './fetch';
import { queryKeys } from './keys';

export type { UsageSummaryData };

const fetchUsageSummary = createQueryFn<UsageSummaryData>('/api/usage/summary');

export const usageSummaryQueryOptions = {
  queryKey: queryKeys.usage.summary(),
  queryFn: fetchUsageSummary,
  ...FREQUENT_BACKGROUND_CACHE,
  retry: (failureCount: number, error: Error) => {
    if (error instanceof FetchError && !error.isRetryable()) {
      return false;
    }
    return failureCount < 1;
  },
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
} as const;

export function useUsageSummaryQuery(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  return useQuery<UsageSummaryData, Error>({
    ...usageSummaryQueryOptions,
    enabled,
  });
}
