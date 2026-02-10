'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  InsightCategory,
  InsightPriority,
  InsightsListResponse,
  InsightsSummaryResponse,
} from '@/types/insights';
import { FREQUENT_CACHE, STANDARD_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

interface InsightsQueryOptions {
  category?: InsightCategory[];
  priority?: InsightPriority[];
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

async function fetchInsights(
  options: InsightsQueryOptions | undefined,
  signal?: AbortSignal
): Promise<InsightsListResponse> {
  const params = new URLSearchParams();
  if (options?.category?.length) {
    params.set('category', options.category.join(','));
  }
  if (options?.priority?.length) {
    params.set('priority', options.priority.join(','));
  }
  if (options?.limit) {
    params.set('limit', String(options.limit));
  }
  if (options?.offset) {
    params.set('offset', String(options.offset));
  }

  const qs = params.toString();
  const url = qs ? `/api/insights?${qs}` : '/api/insights';
  return fetchWithTimeout<InsightsListResponse>(url, { signal });
}

async function fetchInsightsSummary(
  signal?: AbortSignal
): Promise<InsightsSummaryResponse> {
  return fetchWithTimeout<InsightsSummaryResponse>('/api/insights/summary', {
    signal,
  });
}

/**
 * Query hook for the full insights list with filtering and pagination.
 */
export function useInsightsQuery(options?: InsightsQueryOptions) {
  const { enabled = true, ...filterOptions } = options ?? {};

  return useQuery({
    queryKey: queryKeys.insights.list(
      Object.keys(filterOptions).length > 0 ? filterOptions : undefined
    ),
    queryFn: ({ signal }) => fetchInsights(filterOptions, signal),
    ...STANDARD_CACHE,
    enabled,
  });
}

/**
 * Query hook for the dashboard summary widget (top 3 insights).
 */
export function useInsightsSummaryQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.insights.summary(),
    queryFn: ({ signal }) => fetchInsightsSummary(signal),
    ...FREQUENT_CACHE,
    enabled: options?.enabled ?? true,
  });
}
