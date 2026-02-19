'use client';

/**
 * Mutation hook for confirming a chat-driven social link addition.
 *
 * Used by ChatLinkConfirmationCard to add links suggested
 * by the AI chat assistant.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

export interface ConfirmChatLinkInput {
  profileId: string;
  platform: string;
  url: string;
  normalizedUrl: string;
}

interface ConfirmChatLinkResponse {
  success: boolean;
  platform: string;
}

export function useConfirmChatLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMutationFn<ConfirmChatLinkInput, ConfirmChatLinkResponse>(
      '/api/chat/confirm-link',
      'POST'
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.socialLinks(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.profile(),
      });
    },
    onError: error => {
      handleMutationError(error, 'Failed to add link');
    },
  });
}
