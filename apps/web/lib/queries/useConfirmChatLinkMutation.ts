'use client';

/**
 * Mutation hook for confirming a chat-driven social link addition.
 *
 * Used by ChatLinkConfirmationCard to add links suggested
 * by the AI chat assistant.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { TaskPersistenceReceipt } from '../chat/task-persistence';
import { createMutationFn } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

export interface ConfirmChatLinkInput {
  profileId: string;
  platform: string;
  url: string;
  normalizedUrl: string;
  expectedVersion?: number;
  requestId?: string;
  /** Read the existing confirmation receipt without executing a write. */
  reconcile?: boolean;
}

interface ConfirmChatLinkResponse {
  success: boolean;
  acknowledged?: false;
  replayed?: boolean;
  platform?: string;
  /** True create vs platform URL overwrite (JOV-3549). */
  outcome?: 'created' | 'updated';
  linkId?: string;
  version?: number;
  receipt?: TaskPersistenceReceipt;
}

const responseSchema = z.discriminatedUnion('success', [
  z.object({ success: z.literal(false), acknowledged: z.literal(false) }),
  z.object({
    success: z.literal(true),
    replayed: z.boolean().optional(),
    platform: z.string(),
    linkId: z.string().uuid(),
    version: z.number().int().positive(),
    outcome: z.enum(['created', 'updated']),
    receipt: z
      .object({
        scopeId: z.string(),
        requestId: z.string(),
        objectId: z.string(),
        revision: z.number().int().positive(),
        durability: z.enum(['local', 'remote']),
      })
      .optional(),
  }),
]);

export function useConfirmChatLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: createMutationFn<ConfirmChatLinkInput, ConfirmChatLinkResponse>(
      '/api/chat/confirm-link',
      'POST',
      { schema: responseSchema }
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.socialLinks(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.profile(),
      });
    },
    onError: (error, input) => {
      // Receipt-aware cards own the distinction between rejection and unknown
      // acknowledgement. A generic retry toast would invite a second mutation.
      if (input.requestId) return;
      handleMutationError(error, 'Failed to add link');
    },
  });
}
