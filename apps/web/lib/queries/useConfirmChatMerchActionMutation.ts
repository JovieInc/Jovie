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

export interface ConfirmChatMerchStatusActionInput {
  readonly profileId: string;
  readonly merchCardId: string;
  readonly action: ConfirmChatMerchActionType;
}

export interface ConfirmChatMerchSelectInput {
  readonly profileId: string;
  readonly generationId: string;
  readonly optionId: string;
  readonly optionNumber: number;
  readonly action: 'select';
}

export type ConfirmChatMerchActionInput =
  | ConfirmChatMerchStatusActionInput
  | ConfirmChatMerchSelectInput;

export interface ConfirmChatMerchStatusActionResponse {
  readonly success: true;
  readonly merchCardId: string;
  readonly status: string;
  readonly title: string;
}

export interface ConfirmChatMerchSelectResponse
  extends ConfirmChatMerchStatusActionResponse {
  readonly selectedOptionId: string;
  readonly publicUrl: string | null;
  readonly publishBlockedReasons?: readonly string[];
  readonly product: {
    readonly productType: string;
    readonly productName: string;
    readonly colorway: string;
    readonly artworkUrl: string | null;
    readonly mockupUrl: string | null;
    readonly mockupStatus: 'ready' | 'pending';
    readonly retailPrice: string;
    readonly artistProfit: string;
    readonly publishEligible: boolean;
  };
}

export type ConfirmChatMerchActionResponse =
  | ConfirmChatMerchStatusActionResponse
  | ConfirmChatMerchSelectResponse;

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
