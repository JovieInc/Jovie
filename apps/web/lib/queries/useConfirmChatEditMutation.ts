'use client';

/**
 * Mutation hook for confirming a chat-driven profile edit.
 *
 * Used by ProfileEditPreviewCard to apply profile changes
 * suggested by the AI chat assistant.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

export interface ConfirmChatEditInput {
  profileId: string;
  field: 'displayName' | 'bio' | 'genres';
  newValue: string | string[];
  conversationId?: string;
  messageId?: string;
}

interface ConfirmChatEditResponse {
  success: boolean;
}

export function useConfirmChatEditMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMutationFn<ConfirmChatEditInput, ConfirmChatEditResponse>(
      '/api/chat/confirm-edit',
      'POST'
    ),
    onSuccess: () => {
      // Invalidate profile to reflect the applied edit
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.profile(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
    },
    onError: error => {
      handleMutationError(error, 'Failed to apply edit');
    },
  });
}
