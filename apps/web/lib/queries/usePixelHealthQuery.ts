'use client';

import { useQuery } from '@tanstack/react-query';
import { createQueryFn } from './fetch';
import { queryKeys } from './keys';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'inactive';

export interface PlatformHealth {
  status: HealthStatus;
  totalSent: number;
  totalFailed: number;
  lastSuccessAt: string | null;
}

export interface PixelHealthData {
  platforms: {
    facebook: PlatformHealth;
    google: PlatformHealth;
    tiktok: PlatformHealth;
  };
  aggregate: {
    totalEventsThisWeek: number;
    overallSuccessRate: number;
  };
}

const fetchPixelHealth = createQueryFn<PixelHealthData>(
  '/api/dashboard/pixels/health'
);

/**
 * TanStack Query hook for fetching ad pixel health status.
 *
 * @example
 * const { data, isLoading } = usePixelHealthQuery({ enabled: isPro });
 */
export function usePixelHealthQuery({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  return useQuery({
    queryKey: queryKeys.pixels.health(),
    queryFn: fetchPixelHealth,
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes - health status changes more frequently
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
