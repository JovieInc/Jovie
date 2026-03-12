'use client';

import { type QueryClient, useQuery } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import type { EnvHealthResponse } from '@/lib/contracts/api';

export type { EnvHealthResponse } from '@/lib/contracts/api';

import { queryKeys } from './keys';

/**
 * Query function for fetching environment health status.
 */
async function fetchEnvHealth({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<EnvHealthResponse> {
  return fetchWithTimeout<EnvHealthResponse>('/api/health/env', {
    cache: 'no-store',
    signal,
  });
}

/**
 * TanStack Query hook for fetching environment health status.
 *
 * Features:
 * - 5-minute stale time to avoid excessive polling
 * - Disabled by default - must be explicitly enabled
 * - Returns critical and error issues for display
 *
 * @example
 * const { data: envHealth, isLoading } = useEnvHealthQuery({ enabled: isAdmin });
 *
 * const issues = envHealth?.details?.currentValidation
 *   ? [
 *       ...envHealth.details.currentValidation.critical,
 *       ...envHealth.details.currentValidation.errors,
 *     ]
 *   : [];
 */
export function useEnvHealthQuery({
  enabled = false,
  queryClient,
}: {
  enabled?: boolean;
  queryClient?: QueryClient;
}) {
  return useQuery(
    {
      queryKey: queryKeys.health.env(),
      queryFn: ({ signal }) => fetchEnvHealth({ signal }),
      enabled,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: false, // Don't retry health checks - they may fail intentionally
    },
    queryClient
  );
}
