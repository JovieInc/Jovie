'use client';

/**
 * Suggestions Query Hook
 *
 * TanStack Query hook for fetching and polling social link suggestions.
 * Supports dynamic polling intervals for auto-refresh mode.
 */

import { useQuery } from '@tanstack/react-query';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions/social-links';
import { queryKeys } from './keys';

export interface SuggestionsQueryResult {
  links: ProfileSocialLink[];
  maxVersion: number;
}

async function fetchSuggestions(
  profileId: string,
  signal?: AbortSignal
): Promise<SuggestionsQueryResult> {
  const response = await fetch(
    `/api/dashboard/social-links?profileId=${profileId}`,
    { cache: 'no-store', signal }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch suggestions');
  }

  const data = (await response.json()) as { links?: ProfileSocialLink[] };

  if (!data?.links) {
    return { links: [], maxVersion: 1 };
  }

  // Calculate max version from server response
  const versions = data.links
    .map(l => l.version ?? 1)
    .filter(v => typeof v === 'number');
  const maxVersion = versions.length > 0 ? Math.max(...versions) : 1;

  return {
    links: data.links,
    maxVersion,
  };
}

export interface UseSuggestionsQueryOptions {
  profileId: string | undefined;
  enabled?: boolean;
  /** Polling interval in ms. Set to false to disable polling. */
  refetchInterval?: number | false;
}

/**
 * Query hook for fetching social link suggestions with optional polling.
 *
 * @example
 * ```tsx
 * // Basic usage with default polling
 * const { data, isLoading } = useSuggestionsQuery({
 *   profileId,
 *   enabled: true,
 * });
 *
 * // With dynamic polling interval
 * const { data } = useSuggestionsQuery({
 *   profileId,
 *   enabled: true,
 *   refetchInterval: autoRefreshMode ? 2000 : 4500,
 * });
 * ```
 */
export function useSuggestionsQuery({
  profileId,
  enabled = true,
  refetchInterval = 4500,
}: UseSuggestionsQueryOptions) {
  return useQuery<SuggestionsQueryResult>({
    queryKey: queryKeys.suggestions.list(profileId ?? ''),
    queryFn: ({ signal }) => fetchSuggestions(profileId!, signal),
    enabled: enabled && !!profileId,
    refetchInterval,
    // Don't refetch on window focus since we're already polling
    refetchOnWindowFocus: false,
    staleTime: 1 * 60 * 1000, // 1 min
    gcTime: 10 * 60 * 1000, // 10 min
    refetchOnMount: true,
  });
}
