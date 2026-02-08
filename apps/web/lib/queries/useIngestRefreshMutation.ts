'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { APP_ROUTES } from '@/constants/routes';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export interface IngestRefreshInput {
  profileId: string;
}

export interface IngestRefreshResponse {
  success: boolean;
  queuedCount?: number;
  error?: string;
}

/**
 * Mutation function for refreshing ingestion on a creator profile.
 */
async function refreshIngest(
  input: IngestRefreshInput
): Promise<IngestRefreshResponse> {
  try {
    const payload = await fetchWithTimeout<{
      success?: boolean;
      queuedCount?: number;
      error?: string;
    }>(APP_ROUTES.ADMIN_CREATORS_BULK_REFRESH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ profileIds: [input.profileId] }),
    });

    if (!payload.success) {
      throw new Error(payload.error ?? 'Failed to queue ingestion');
    }

    return {
      success: true,
      queuedCount: payload.queuedCount,
    };
  } catch (error) {
    if (error instanceof FetchError) {
      throw new Error('Failed to queue ingestion');
    }
    throw error;
  }
}

/**
 * TanStack Query mutation hook for refreshing ingestion on a creator profile.
 *
 * @example
 * const { mutate: refreshIngest, isPending } = useIngestRefreshMutation();
 *
 * refreshIngest(
 *   { profileId: '123' },
 *   {
 *     onSuccess: () => {
 *       toast.success('Ingestion refresh queued');
 *       router.refresh();
 *     },
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useIngestRefreshMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: refreshIngest,
    onSettled: (_data, _error, variables) => {
      // Invalidate the social links query for this profile to refetch after ingest
      queryClient.invalidateQueries({
        queryKey: queryKeys.creators.socialLinks(variables.profileId),
      });
      // Also invalidate the creators list
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}
