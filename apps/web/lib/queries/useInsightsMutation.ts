'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  InsightGenerateResponse,
  InsightUpdateRequest,
} from '@/types/insights';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

/**
 * Mutation hook for triggering insight generation.
 * Automatically invalidates insight queries on success.
 */
export function useGenerateInsightsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<InsightGenerateResponse> => {
      return fetchWithTimeout<InsightGenerateResponse>(
        '/api/insights/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.insights.all });
    },
  });
}

/**
 * Mutation hook for updating an insight's status (dismiss or mark as acted on).
 * Automatically invalidates insight queries on success.
 */
export function useUpdateInsightMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      insightId,
      status,
    }: {
      insightId: string;
      status: InsightUpdateRequest['status'];
    }): Promise<{ ok: boolean }> => {
      return fetchWithTimeout<{ ok: boolean }>(`/api/insights/${insightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.insights.all });
    },
  });
}
