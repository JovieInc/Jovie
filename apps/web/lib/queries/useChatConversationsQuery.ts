'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export interface ChatConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
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
    queryKey: queryKeys.chat.conversations(),
    queryFn: ({ signal }) => fetchConversations(limit, signal),
    enabled,
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
