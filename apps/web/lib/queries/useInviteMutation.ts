'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export interface CreateInviteInput {
  creatorProfileId: string;
  email: string;
}

export interface CreateInviteResponse {
  success: boolean;
  invite?: {
    id: string;
    email: string;
    status: string;
  };
}

/**
 * Mutation function for creating a creator claim invite.
 */
async function createInvite(
  input: CreateInviteInput
): Promise<CreateInviteResponse> {
  try {
    const data = await fetchWithTimeout<{
      ok?: boolean;
      error?: string;
      invite?: { id: string; email: string; status: string };
    }>('/api/admin/creator-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!data.ok) {
      throw new Error(data.error ?? 'Failed to create invite');
    }

    return {
      success: true,
      invite: data.invite,
    };
  } catch (error) {
    if (error instanceof FetchError) {
      throw new Error('Failed to create invite');
    }
    throw error;
  }
}

/**
 * TanStack Query mutation hook for creating creator claim invites.
 *
 * @example
 * const { mutate: createInvite, isPending } = useCreateInviteMutation();
 *
 * createInvite(
 *   { creatorProfileId: '123', email: 'creator@example.com' },
 *   {
 *     onSuccess: () => toast.success('Invite created'),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useCreateInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createInvite,
    onSettled: (_data, _error, variables) => {
      // Invalidate creator detail to refresh invite status
      queryClient.invalidateQueries({
        queryKey: queryKeys.creators.detail(variables.creatorProfileId),
      });
    },
  });
}
