'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { queryKeys } from './keys';
import type { ChatConversation } from './useChatConversationsQuery';

// Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Record<string, unknown>[];
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
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: Record<string, unknown>[];
  }>;
}

interface AddMessagesResponse {
  messages: ChatMessage[];
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
      const response = await fetch(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to add messages');
      }
      return response.json() as Promise<AddMessagesResponse>;
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
 * Mutation hook for updating a conversation's title.
 */
export function useUpdateConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, title }: UpdateConversationInput) => {
      const response = await fetch(
        `/api/chat/conversations/${conversationId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to update conversation');
      }
      return response.json() as Promise<UpdateConversationResponse>;
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
      const response = await fetch(
        `/api/chat/conversations/${conversationId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }
      return response.json() as Promise<DeleteConversationResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
    },
  });
}

// Types for profile edit confirmation
interface ConfirmProfileEditInput {
  profileId: string;
  field: 'displayName' | 'bio' | 'genres';
  newValue: string | string[];
}

interface ConfirmProfileEditResponse {
  success: boolean;
  updatedField: string;
}

/**
 * Mutation hook for confirming a profile edit suggested by chat.
 * Invalidates the profile query after successful edit.
 */
export function useConfirmProfileEditMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      field,
      newValue,
    }: ConfirmProfileEditInput) => {
      const response = await fetch('/api/chat/confirm-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, field, newValue }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to apply edit');
      }

      return response.json() as Promise<ConfirmProfileEditResponse>;
    },
    onSuccess: () => {
      // Invalidate dashboard and profile queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.all(),
      });
    },
  });
}
