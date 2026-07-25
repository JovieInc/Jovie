'use client';

/**
 * Mutation hook for removing a social link from a profile.
 *
 * Used by the profile sidebar to delete links inline.
 * Uses the existing DELETE /api/dashboard/social-links endpoint
 * with action: 'dismiss' to soft-delete the link.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

export interface RemoveSocialLinkInput {
  profileId: string;
  linkId: string;
  expectedVersion: number;
}

interface RemoveSocialLinkResponse {
  ok: boolean;
  version?: number;
}

async function removeSocialLink(
  input: RemoveSocialLinkInput
): Promise<RemoveSocialLinkResponse> {
  return fetchWithTimeout<RemoveSocialLinkResponse>(
    '/api/dashboard/social-links',
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: input.profileId,
        linkId: input.linkId,
        action: 'dismiss',
        expectedVersion: input.expectedVersion,
      }),
    }
  );
}

export function useRemoveSocialLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeSocialLink,
    onSuccess: (_data, variables) => {
      // Invalidate social links queries to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.socialLinks(variables.profileId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.socialLinks(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.profile(),
      });
    },
    onError: error => {
      handleMutationError(error, 'Failed to remove link');
    },
  });
}
