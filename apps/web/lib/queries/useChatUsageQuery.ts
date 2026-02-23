'use client';

import { useQuery } from '@tanstack/react-query';
import { STABLE_CACHE } from './cache-strategies';
import { createQueryFn, FetchError } from './fetch';
import { queryKeys } from './keys';

export interface ChatUsageData {
  plan: 'free' | 'pro' | 'growth';
  dailyLimit: number;
  used: number;
  remaining: number;
  isExhausted: boolean;
  warningThreshold: number;
  isNearLimit: boolean;
}

const fetchChatUsage = createQueryFn<ChatUsageData>('/api/chat/usage');

export const chatUsageQueryOptions = {
  queryKey: queryKeys.chat.usage(),
  queryFn: fetchChatUsage,
  ...STABLE_CACHE,
  retry: (failureCount: number, error: Error) => {
    if (error instanceof FetchError && !error.isRetryable()) {
      return false;
    }
    return failureCount < 1;
  },
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
  refetchOnWindowFocus: true,
} as const;

export function useChatUsageQuery() {
  return useQuery<ChatUsageData, Error>(chatUsageQueryOptions);
}
