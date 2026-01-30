'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export interface IngestProfileInput {
  url: string;
}

export interface IngestProfileResponse {
  success: boolean;
  profile?: {
    id: string;
    username: string;
  };
  links?: number;
}

/**
 * Mutation function for ingesting a new creator profile from a URL.
 */
async function ingestProfile(
  input: IngestProfileInput
): Promise<IngestProfileResponse> {
  try {
    const result = await fetchWithTimeout<{
      ok?: boolean;
      error?: string;
      profile?: { id: string; username: string };
      links?: number;
    }>('/api/admin/creator-ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!result.ok) {
      throw new Error(result.error ?? 'Failed to ingest profile');
    }

    return {
      success: true,
      profile: result.profile,
      links: result.links,
    };
  } catch (error) {
    if (error instanceof FetchError) {
      throw new Error('Failed to ingest profile');
    }
    throw error;
  }
}

/**
 * TanStack Query mutation hook for ingesting creator profiles from URLs.
 *
 * @example
 * const { mutate: ingestProfile, isPending } = useIngestProfileMutation();
 *
 * ingestProfile(
 *   { url: 'https://open.spotify.com/artist/...' },
 *   {
 *     onSuccess: (data) => {
 *       toast.success(`Created profile @${data.profile?.username}`);
 *       router.refresh();
 *     },
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useIngestProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ingestProfile,
    onSettled: () => {
      // Invalidate creators list to show new profile
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}
