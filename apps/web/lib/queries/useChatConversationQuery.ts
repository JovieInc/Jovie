'use client';

import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { z } from 'zod';
import { CURRENT_SUMMER_SESSION_ID } from '@/lib/ovie/summer-session';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import type { ChatConversation } from './useChatConversationsQuery';
import type { ChatMessage } from './useChatMutations';

interface ConversationWithMessages {
  conversation: Pick<ChatConversation, 'id' | 'title'>;
  chatMode?: 'ov';
  messages: ChatMessage[];
  hasMore: boolean;
}

interface ConversationOptions {
  chatMode?: 'ov';
  conversationId: string | null;
  enabled?: boolean;
  /** Poll interval in ms. Use to poll for title generation. Pass false to disable. */
  refetchInterval?: number | false;
}

export const CHAT_CONVERSATION_FETCH_TIMEOUT_MS = 60_000;
const summerHistorySchema = z.object({
  chatMode: z.literal('ov'),
  conversation: z.object({
    id: z.literal(CURRENT_SUMMER_SESSION_ID),
    title: z.literal('Summer'),
  }),
  messages: z.array(
    z.object({
      id: z.string().min(1),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      createdAt: z.string().datetime(),
      clientMessageId: z.string().nullable(),
    })
  ),
  hasMore: z.literal(false),
});

async function fetchConversation(
  conversationId: string,
  signal?: AbortSignal
): Promise<ConversationWithMessages> {
  return fetchWithTimeout<ConversationWithMessages>(
    `/api/chat/conversations/${conversationId}`,
    { signal, timeout: CHAT_CONVERSATION_FETCH_TIMEOUT_MS }
  );
}

/**
 * Query hook for fetching a single conversation with all its messages.
 *
 * Supports `refetchInterval` for polling during title generation.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useChatConversationQuery({
 *   conversationId: 'abc-123',
 * });
 * ```
 */
export function useChatConversationQuery({
  conversationId,
  enabled = true,
  refetchInterval = false,
  chatMode,
}: ConversationOptions) {
  const historyMountId = useId();
  const isSummer = chatMode === 'ov';
  return useQuery({
    // Summer history is private to this mounted door, never a customer cache.
    queryKey: isSummer
      ? ['summer-history', historyMountId]
      : queryKeys.chat.conversation(conversationId ?? ''),
    queryFn: ({ signal }) =>
      isSummer
        ? fetchWithTimeout<ConversationWithMessages>(
            '/api/ovie/summer/history',
            { signal, cache: 'no-store', schema: summerHistorySchema }
          )
        : fetchConversation(conversationId!, signal),
    enabled: enabled && (isSummer || !!conversationId),
    staleTime: isSummer ? 0 : 10_000,
    gcTime: isSummer ? 0 : 5 * 60 * 1000,
    placeholderData: isSummer
      ? undefined
      : previous => (previous?.chatMode === 'ov' ? undefined : previous),
    ...(isSummer
      ? {
          retry: false,
          refetchOnReconnect: false,
          refetchOnMount: 'always' as const,
        }
      : {}),
    refetchOnWindowFocus: false,
    refetchInterval: isSummer ? false : refetchInterval,
    refetchIntervalInBackground: false,
  });
}
