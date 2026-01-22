'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  const response = await fetch('/app/admin/creators/bulk-refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ profileIds: [input.profileId] }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    queuedCount?: number;
    error?: string;
  };

  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? 'Failed to queue ingestion');
  }

  return {
    success: true,
    queuedCount: payload.queuedCount,
  };
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
