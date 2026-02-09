'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMutationFn, fetchWithTimeout } from './fetch';
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

export type PixelPlatform = 'facebook' | 'google' | 'tiktok';

export interface PixelDeleteInput {
  platform?: PixelPlatform;
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

/**
 * TanStack Query mutation hook for deleting/clearing pixel settings.
 *
 * Pass a `platform` to clear a single platform's credentials,
 * or omit it to delete all pixel configuration.
 *
 * @example
 * const { mutate: deletePixels } = usePixelDeleteMutation();
 *
 * // Clear only Facebook credentials
 * deletePixels({ platform: 'facebook' });
 *
 * // Delete all pixel config
 * deletePixels({});
 */
export function usePixelDeleteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: PixelDeleteInput
    ): Promise<PixelSettingsResponse> => {
      const params = input.platform ? `?platform=${input.platform}` : '';
      return fetchWithTimeout<PixelSettingsResponse>(
        `/api/dashboard/pixels${params}`,
        { method: 'DELETE' }
      );
    },
    onSuccess: (_data, variables) => {
      const msg = variables.platform
        ? `${variables.platform.charAt(0).toUpperCase() + variables.platform.slice(1)} pixel cleared`
        : 'All pixel settings deleted';
      handleMutationSuccess(msg);
      queryClient.invalidateQueries({ queryKey: ['pixelSettings'] });
    },
    onError: error => {
      handleMutationError(error, 'Failed to delete pixel settings');
    },
  });
}
