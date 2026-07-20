'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

export type ConfirmChatMerchActionType =
  | 'publish'
  | 'archive'
  | 'unpause'
  | 'pause';

export interface ConfirmChatMerchActionInput {
  readonly profileId: string;
  readonly merchCardId: string;
  readonly action: ConfirmChatMerchActionType;
}

interface ConfirmChatMerchActionResponse {
  readonly success: boolean;
  readonly merchCardId: string;
  readonly status: string;
  readonly title: string;
}

export function useConfirmChatMerchActionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMutationFn<
      ConfirmChatMerchActionInput,
      ConfirmChatMerchActionResponse
    >('/api/chat/confirm-merch-action', 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.profile(),
      });
    },
    onError: error => {
      handleMutationError(error, 'Failed to apply merch action');
    },
  });
}
