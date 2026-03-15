'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_ROUTES } from '@/constants/routes';
import { createMutationFn, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError, handleMutationSuccess } from './mutation-utils';

export interface WaitlistSettingsResponse {
  gateEnabled: boolean;
  autoAcceptEnabled: boolean;
  autoAcceptDailyLimit: number;
  autoAcceptedToday: number;
  autoAcceptResetsAt: string;
}

interface WaitlistSettingsApiResponse {
  settings: WaitlistSettingsResponse;
}

export interface WaitlistSettingsUpdateInput {
  gateEnabled: boolean;
  autoAcceptEnabled: boolean;
  autoAcceptDailyLimit: number;
}

async function fetchWaitlistSettings(
  signal?: AbortSignal
): Promise<WaitlistSettingsResponse> {
  const payload = await fetchWithTimeout<WaitlistSettingsApiResponse>(
    APP_ROUTES.ADMIN_WAITLIST_SETTINGS,
    { signal, cache: 'no-store' }
  );

  if (!payload.settings) {
    throw new Error('Invalid waitlist settings response');
  }

  return payload.settings;
}

/**
 * Query hook for fetching waitlist settings.
 */
export function useWaitlistSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.admin.waitlistSettings(),
    queryFn: ({ signal }) => fetchWaitlistSettings(signal),
    staleTime: 0, // Always refetch on mount (settings panel)
    gcTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
}

const updateWaitlistSettingsFn = createMutationFn<
  WaitlistSettingsUpdateInput,
  WaitlistSettingsApiResponse
>(APP_ROUTES.ADMIN_WAITLIST_SETTINGS, 'PATCH');

/**
 * Mutation hook for updating waitlist settings.
 */
export function useWaitlistSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateWaitlistSettingsFn,
    onSuccess: data => {
      // Update the cache with the server response
      queryClient.setQueryData(
        queryKeys.admin.waitlistSettings(),
        data.settings
      );
      handleMutationSuccess('Waitlist settings saved');
    },
    onError: error =>
      handleMutationError(error, 'Failed to save waitlist settings'),
  });
}
