'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  const response = await fetch('/app/admin/creators/toggle-verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    isVerified?: boolean;
    error?: string;
  };

  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? 'Failed to update verification status');
  }

  return {
    success: true,
    isVerified:
      typeof payload.isVerified === 'boolean'
        ? payload.isVerified
        : input.nextVerified,
  };
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
