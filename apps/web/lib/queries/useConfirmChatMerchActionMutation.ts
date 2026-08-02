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
  readonly catalogProductId: number;
  readonly action: 'select';
}

export interface ConfirmChatMerchCreateInput {
  readonly profileId: string;
  readonly generationId: string;
  readonly optionId: string;
  readonly optionNumber: number;
  readonly action: 'create';
}

export interface ConfirmChatMerchProductsInput {
  readonly profileId: string;
  readonly generationId: string;
  readonly optionId: string;
  readonly optionNumber: number;
  readonly action: 'products';
}

export type ConfirmChatMerchActionInput =
  | ConfirmChatMerchStatusActionInput
  | ConfirmChatMerchProductsInput
  | ConfirmChatMerchSelectInput
  | ConfirmChatMerchCreateInput;

export interface ConfirmChatMerchStatusActionResponse {
  readonly success: true;
  readonly merchCardId: string;
  readonly status: string;
  readonly title: string;
  /** Server-derived only after a card is truly live. */
  readonly publicUrl: string | null;
}

export interface ConfirmChatMerchSelectResponse
  extends ConfirmChatMerchStatusActionResponse {
  readonly selectedOptionId: string;
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

export interface ConfirmChatMerchProductsResponse {
  readonly success: true;
  readonly products: readonly {
    readonly catalogProductId: number;
    readonly productName: string;
    readonly productType: string;
    readonly colorway: string;
  }[];
}

export type ConfirmChatMerchActionResponse =
  | ConfirmChatMerchStatusActionResponse
  | ConfirmChatMerchProductsResponse
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
