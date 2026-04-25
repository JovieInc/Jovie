'use client';

import { type QueryClient, useQuery } from '@tanstack/react-query';
import type { EnvHealthResponse } from '@/lib/contracts/api';
import { FetchError, fetchWithTimeout } from './fetch';

export type { EnvHealthResponse } from '@/lib/contracts/api';

import { queryKeys } from './keys';

/**
 * Query function for fetching environment health status.
 */
function healthyEnvHealthFallback(): EnvHealthResponse {
  return {
    service: 'env',
    status: 'ok',
    ok: true,
    timestamp: new Date().toISOString(),
    details: {
      environment: 'unknown',
      platform: 'unknown',
      nodeVersion: 'unknown',
      startupValidationCompleted: false,
      currentValidation: {
        valid: true,
        errors: [],
        warnings: [],
        critical: [],
      },
      integrations: {
        database: false,
        auth: false,
        payments: false,
        images: false,
      },
    },
  };
}

async function fetchEnvHealth({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<EnvHealthResponse> {
  try {
    return await fetchWithTimeout<EnvHealthResponse>('/api/health/env', {
      signal,
    });
  } catch (error) {
    if (error instanceof FetchError && error.response) {
      // 429 means we couldn't even check — not an env validation failure.
      // Treat it as healthy so the OperatorBanner doesn't surface a fake issue.
      if (error.status === 429) {
        return healthyEnvHealthFallback();
      }
      return (await error.response.json()) as EnvHealthResponse;
    }

    throw error;
  }
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
      refetchOnWindowFocus: false,
      retry: false, // Don't retry health checks - they may fail intentionally
    },
    queryClient
  );
}
