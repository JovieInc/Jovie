'use client';

import { useQuery } from '@tanstack/react-query';
import type { PlanId } from '@/lib/entitlements/registry';
import { FREQUENT_BACKGROUND_CACHE } from './cache-strategies';
import { createQueryFn } from './fetch';
import { queryKeys } from './keys';
import { classifiedRetryDelay, createClassifiedRetry } from './retry-policy';

export interface ChatUsageData {
  plan: PlanId;
  weeklyLimit: number;
  used: number;
  remaining: number;
  resetAt?: string | null;
  isExhausted: boolean;
  warningThreshold: number;
  isNearLimit: boolean;
  /** Present when billing was unavailable and the snapshot is cached or degraded. */
  _stale?: boolean;
}

const fetchChatUsage = createQueryFn<ChatUsageData>('/api/chat/usage');

export const chatUsageQueryOptions = {
  queryKey: queryKeys.chat.usage(),
  queryFn: fetchChatUsage,
  ...FREQUENT_BACKGROUND_CACHE,
  retry: createClassifiedRetry(1),
  retryDelay: classifiedRetryDelay,
} as const;

export function useChatUsageQuery(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  return useQuery<ChatUsageData, Error>({
    ...chatUsageQueryOptions,
    enabled,
  });
}
