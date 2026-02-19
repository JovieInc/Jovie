'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';

export interface EnvHealthResponse {
  ok: boolean;
  status: 'ok' | 'warning' | 'error';
  details: {
    currentValidation: {
      critical: string[];
      errors: string[];
      warnings: string[];
    };
  };
}

/**
 * Query function for fetching environment health status.
 */
async function fetchEnvHealth(): Promise<EnvHealthResponse> {
  const response = await fetch('/api/health/env', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch environment health');
  }

  return response.json();
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
export function useEnvHealthQuery({ enabled = false }: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.health.env(),
    queryFn: fetchEnvHealth,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false, // Don't retry health checks - they may fail intentionally
  });
}
