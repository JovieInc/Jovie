'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ChatPersistenceMessage,
  PersistedToolEvent,
} from '@/lib/chat/tool-events';
import { createMutationFn, FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import type { ChatConversation } from './useChatConversationsQuery';

/**
 * TanStack Query retry callback for mutations.
 * Retries up to `maxRetries` times, but only for transient/retryable errors
 * (5xx, 408 timeout, 429 rate-limit).
 */
function retryTransientErrors(maxRetries: number) {
  return (failureCount: number, error: Error): boolean => {
    if (failureCount >= maxRetries) return false;
    if (error instanceof FetchError) return error.isRetryable();
    return false;
  };
}

/** Exponential backoff: 1s, 2s, 4s (capped at 4s). */
function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 4000);
}

// Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: PersistedToolEvent[];
  createdAt: string;
}

interface CreateConversationInput {
  title?: string;
  initialMessage?: string;
}

interface CreateConversationResponse {
  conversation: ChatConversation;
}

interface AddMessagesInput {
  conversationId: string;
  messages: ChatPersistenceMessage[];
}

interface AddMessagesResponse {
  messages: ChatMessage[];
  titlePending?: boolean;
}

interface UpdateConversationInput {
  conversationId: string;
  title: string;
}

interface UpdateConversationResponse {
  conversation: ChatConversation;
}

interface DeleteConversationInput {
  conversationId: string;
}

interface DeleteConversationResponse {
  success: boolean;
}

/**
 * Mutation hook for creating a new chat conversation.
 */
export function useCreateConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMutationFn<
      CreateConversationInput,
      CreateConversationResponse
    >('/api/chat/conversations', 'POST'),
    retry: retryTransientErrors(2),
    retryDelay,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
    },
  });
}

/**
 * Mutation hook for adding messages to a conversation.
 * Handles both single messages and batch inserts.
 */
export function useAddMessagesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, messages }: AddMessagesInput) => {
      return fetchWithTimeout<AddMessagesResponse>(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
        }
      );
    },
    retry: retryTransientErrors(2),
    retryDelay,
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversation(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
    },
  });
}

/**
 * Mutation hook for updating a conversation's title.
 */
export function useUpdateConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, title }: UpdateConversationInput) => {
      return fetchWithTimeout<UpdateConversationResponse>(
        `/api/chat/conversations/${conversationId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        }
      );
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversation(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
    },
  });
}

/**
 * Mutation hook for deleting a conversation.
 */
export function useDeleteConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId }: DeleteConversationInput) => {
      return fetchWithTimeout<DeleteConversationResponse>(
        `/api/chat/conversations/${conversationId}`,
        {
          method: 'DELETE',
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
    },
  });
}
