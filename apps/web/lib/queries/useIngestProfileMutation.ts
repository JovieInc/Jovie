'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  const response = await fetch('/api/admin/creator-ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const result = (await response.json()) as {
    ok?: boolean;
    error?: string;
    profile?: { id: string; username: string };
    links?: number;
  };

  if (!response.ok || !result.ok) {
    throw new Error(result.error ?? 'Failed to ingest profile');
  }

  return {
    success: true,
    profile: result.profile,
    links: result.links,
  };
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
