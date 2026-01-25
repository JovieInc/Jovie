'use client';

import { usePublicProfileQuery } from '@/lib/queries';

/**
 * Hook to fetch creator profile data by username.
 *
 * Uses TanStack Query for caching and background refetching.
 *
 * @param username - The creator's username to fetch
 * @returns Creator profile data, loading state, and error
 */
export function useCreator(username: string) {
  const {
    data: creator,
    isLoading: loading,
    error,
  } = usePublicProfileQuery({
    username,
    enabled: Boolean(username),
  });

  return {
    creator: creator ?? null,
    loading,
    error: error instanceof Error ? error : null,
  };
}
