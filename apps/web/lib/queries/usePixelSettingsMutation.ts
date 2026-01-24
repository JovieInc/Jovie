'use client';

import { useMutation } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { handleMutationError, handleMutationSuccess } from './mutation-utils';

export interface PixelSettingsInput {
  facebookPixel: string;
  googleAdsConversion: string;
  tiktokPixel: string;
  customPixel: string;
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
 *   facebookPixel: '123',
 *   googleAdsConversion: 'AW-123',
 *   tiktokPixel: 'ABC123',
 *   customPixel: '',
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
