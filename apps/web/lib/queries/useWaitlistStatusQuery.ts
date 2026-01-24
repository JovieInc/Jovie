'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';

export interface WaitlistStatusResponse {
  hasEntry: boolean;
  status: 'pending' | 'invited' | 'claimed' | null;
  inviteToken: string | null;
}

async function fetchWaitlistStatus(
  signal?: AbortSignal
): Promise<WaitlistStatusResponse> {
  const response = await fetch('/api/waitlist', { signal });
  if (!response.ok) {
    throw new Error('Failed to check waitlist status');
  }
  return response.json() as Promise<WaitlistStatusResponse>;
}

/**
 * Query hook for checking current user's waitlist status.
 *
 * Uses TanStack Query for automatic caching and deduplication.
 * Enabled only when user is signed in.
 *
 * @param enabled - Whether the query should run (typically isLoaded && isSignedIn)
 * @returns Query result with waitlist status data
 */
export function useWaitlistStatusQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.waitlist.status(),
    queryFn: ({ signal }) => fetchWaitlistStatus(signal),
    enabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}
