'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { APP_ROUTES } from '@/constants/routes';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export interface ToggleVerificationInput {
  profileId: string;
  nextVerified: boolean;
}

export interface ToggleVerificationResponse {
  success: boolean;
  isVerified?: boolean;
  error?: string;
}

/**
 * Mutation function for toggling creator verification status.
 */
async function toggleVerification(
  input: ToggleVerificationInput
): Promise<ToggleVerificationResponse> {
  try {
    const payload = await fetchWithTimeout<{
      success?: boolean;
      isVerified?: boolean;
      error?: string;
    }>(APP_ROUTES.ADMIN_CREATORS_TOGGLE_VERIFY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!payload.success) {
      throw new Error(payload.error ?? 'Failed to update verification status');
    }

    return {
      success: true,
      isVerified:
        typeof payload.isVerified === 'boolean'
          ? payload.isVerified
          : input.nextVerified,
    };
  } catch (error) {
    if (error instanceof FetchError) {
      throw new Error('Failed to update verification status');
    }
    throw error;
  }
}

/**
 * TanStack Query mutation hook for toggling creator verification status.
 *
 * @example
 * const { mutate: toggleVerification, isPending } = useToggleVerificationMutation();
 *
 * toggleVerification(
 *   { profileId: '123', nextVerified: true },
 *   {
 *     onSuccess: (data) => {
 *       toast.success(`Verification ${data.isVerified ? 'enabled' : 'disabled'}`);
 *     },
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useToggleVerificationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleVerification,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}
