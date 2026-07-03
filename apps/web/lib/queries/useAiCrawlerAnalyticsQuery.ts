'use client';

import { useQuery } from '@tanstack/react-query';
import { STABLE_CACHE } from '@/lib/queries/cache-strategies';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';

async function fetchAiCrawlerAnalytics(
  signal: AbortSignal
): Promise<AiCrawlerAnalyticsResponse> {
  return fetchWithTimeout<AiCrawlerAnalyticsResponse>(
    '/api/dashboard/ai-crawlers',
    { signal }
  );
}

export function useAiCrawlerAnalyticsQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard.aiCrawlers(),
    queryFn: ({ signal }) => fetchAiCrawlerAnalytics(signal),
    staleTime: STABLE_CACHE.staleTime,
    gcTime: STABLE_CACHE.gcTime,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
