'use client';

import { useQuery } from '@tanstack/react-query';
import { createQueryFn } from './fetch';
import { queryKeys } from './keys';

export interface PixelSettingsData {
  pixels: {
    facebookPixelId: string | null;
    googleMeasurementId: string | null;
    tiktokPixelId: string | null;
    enabled: boolean;
    facebookEnabled: boolean;
    googleEnabled: boolean;
    tiktokEnabled: boolean;
  };
  hasTokens: {
    facebook: boolean;
    google: boolean;
    tiktok: boolean;
  };
}

const fetchPixelSettings = createQueryFn<PixelSettingsData>(
  '/api/dashboard/pixels'
);

/**
 * TanStack Query hook for fetching ad pixel settings.
 *
 * @example
 * const { data, isLoading, isError } = usePixelSettingsQuery({ enabled: isPro });
 */
export function usePixelSettingsQuery({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  return useQuery({
    queryKey: queryKeys.pixels.settings(),
    queryFn: fetchPixelSettings,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - pixel settings rarely change
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache after unmount
  });
}
