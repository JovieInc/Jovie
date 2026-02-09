'use client';

import { useQuery } from '@tanstack/react-query';
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

async function fetchConversation(
  conversationId: string,
  signal?: AbortSignal
): Promise<ConversationWithMessages> {
  return fetchWithTimeout<ConversationWithMessages>(
    `/api/chat/conversations/${conversationId}`,
    { signal }
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
    staleTime: 10_000, // 10 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval,
  });
}
