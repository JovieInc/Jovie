'use client';

import { useMutation } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { handleMutationError, handleMutationSuccess } from './mutation-utils';

export interface PixelSettingsInput {
  // Facebook Conversions API
  facebookPixelId: string;
  facebookAccessToken: string;
  // Google Measurement Protocol
  googleMeasurementId: string;
  googleApiSecret: string;
  // TikTok Events API
  tiktokPixelId: string;
  tiktokAccessToken: string;
  // Master toggle
  enabled: boolean;
}

export interface PixelSettingsResponse {
  success: boolean;
}

const updatePixelSettings = createMutationFn<
  PixelSettingsInput,
  PixelSettingsResponse
>('/api/dashboard/pixels', 'PUT');

/**
 * TanStack Query mutation hook for updating ad pixel settings.
 *
 * @example
 * const { mutate: savePixels, isPending } = usePixelSettingsMutation();
 *
 * savePixels({
 *   facebookPixelId: '123456789012345',
 *   facebookAccessToken: 'EAAxxxxxxx...',
 *   googleMeasurementId: 'G-XXXXXXXXXX',
 *   googleApiSecret: 'xxxxxxxxxx',
 *   tiktokPixelId: 'CXXXXXXXXXX',
 *   tiktokAccessToken: 'xxxxxxxxxx',
 *   enabled: true,
 * });
 */
export function usePixelSettingsMutation() {
  return useMutation({
    mutationFn: updatePixelSettings,
    onSuccess: () => {
      handleMutationSuccess('Pixels saved');
    },
    onError: error => {
      handleMutationError(error, 'Failed to save pixels');
    },
  });
}
