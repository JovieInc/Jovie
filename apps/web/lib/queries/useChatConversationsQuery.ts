'use client';

import { useQuery } from '@tanstack/react-query';
import { FREQUENT_BACKGROUND_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export interface ChatConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  latestMessageRole?: 'user' | 'assistant' | 'system' | null;
  latestTurnStatus?:
    | 'reserved'
    | 'running'
    | 'streaming'
    | 'completed'
    | 'failed_tool_unavailable'
    | 'failed_model_error'
    | 'failed_timeout'
    | 'failed_network'
    | 'canceled'
    | null;
}

interface ConversationsResponse {
  conversations: ChatConversation[];
}

interface ConversationsOptions {
  limit?: number;
  enabled?: boolean;
}

async function fetchConversations(
  limit: number,
  signal?: AbortSignal
): Promise<ChatConversation[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  const response = await fetchWithTimeout<ConversationsResponse>(
    `/api/chat/conversations?${params.toString()}`,
    { signal }
  );
  return response.conversations ?? [];
}

/**
 * Query hook for fetching chat conversation history.
 *
 * @example
 * ```tsx
 * const { data: conversations, isLoading } = useChatConversationsQuery();
 * ```
 */
export function useChatConversationsQuery({
  limit = 20,
  enabled = true,
}: ConversationsOptions = {}) {
  return useQuery({
    // Stable key (limit omitted from key) unifies shell chrome callers
    // (nav=10, palette=10, threads=50) behind one cache entry + preset
    // (FREQUENT_BACKGROUND_CACHE has refetchOnMount:false to prevent
    // duplicate /api/chat/conversations on inner dashboard route transitions).
    queryKey: queryKeys.chat.conversations(),
    // Always fetch a canonical high limit (50) under the stable key so every
    // shell consumer (regardless of requested limit) gets the full recent set
    // from one network call; small-limit UIs just render a prefix.
    queryFn: ({ signal }) => fetchConversations(Math.max(50, limit), signal),
    enabled,
    ...FREQUENT_BACKGROUND_CACHE,
  });
}
