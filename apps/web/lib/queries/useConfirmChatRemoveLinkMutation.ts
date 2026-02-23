'use client';

/**
 * Mutation hook for confirming a chat-driven social link removal.
 *
 * Used by ChatLinkRemovalCard to remove links suggested
 * for removal by the AI chat assistant.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

export interface ConfirmChatRemoveLinkInput {
  profileId: string;
  linkId: string;
}

interface ConfirmChatRemoveLinkResponse {
  success: boolean;
  platform: string;
}

export function useConfirmChatRemoveLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMutationFn<
      ConfirmChatRemoveLinkInput,
      ConfirmChatRemoveLinkResponse
    >('/api/chat/confirm-remove-link', 'POST'),
    onSuccess: () => {
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
