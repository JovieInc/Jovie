'use client';

import { type QueryClient, useQuery } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import type { ChatConversation } from './useChatConversationsQuery';
import type { ChatMessage } from './useChatMutations';

interface ConversationWithMessages {
  conversation: ChatConversation;
  messages: ChatMessage[];
  hasMore: boolean;
}

interface ConversationOptions {
  conversationId: string | null;
  enabled?: boolean;
  /** Poll interval in ms. Use to poll for title generation. Pass false to disable. */
  refetchInterval?: number | false;
}

export const CHAT_CONVERSATION_FETCH_TIMEOUT_MS = 60_000;
const CHAT_CONVERSATION_STALE_TIME_MS = 10_000;

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
}: ConversationOptions) {
  return useQuery({
    queryKey: queryKeys.chat.conversation(conversationId ?? ''),
    queryFn: ({ signal }) => fetchConversation(conversationId!, signal),
    enabled: enabled && !!conversationId,
    staleTime: CHAT_CONVERSATION_STALE_TIME_MS,
    gcTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: previous => previous,
    refetchOnWindowFocus: false,
    refetchInterval,
    refetchIntervalInBackground: false,
  });
}

/**
 * Warm the conversation cache ahead of navigation (sidebar hover/focus) so a
 * thread switch paints from cache instead of a skeleton (JOV-5874). Shares the
 * key, fetcher, and staleness window with `useChatConversationQuery`, so a
 * fresh entry is a no-op and a hover never triggers a second in-flight fetch.
 */
export function prefetchChatConversation(
  queryClient: QueryClient,
  conversationId: string
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.chat.conversation(conversationId),
    queryFn: ({ signal }) => fetchConversation(conversationId, signal),
    staleTime: CHAT_CONVERSATION_STALE_TIME_MS,
  });
}
