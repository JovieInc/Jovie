'use client';

/**
 * Dashboard social links query and mutation hooks.
 *
 * Provides TanStack Query hooks for:
 * - Fetching social links for a profile
 * - Saving social links (batch update)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { track } from '@/lib/analytics';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError, handleMutationSuccess } from './mutation-utils';

/**
 * Social link type from API response.
 */
export interface DashboardSocialLink {
  id: string;
  platform: string;
  url: string;
}

/**
 * Input for saving social links.
 */
export interface SaveSocialLinksInput {
  profileId: string;
  links: Array<{
    platform: string;
    platformType: string;
    url: string;
    sortOrder: number;
    isActive: boolean;
    displayText?: string;
    state?: string;
    confidence?: number;
    sourcePlatform?: string;
    sourceType?: string;
    evidence?: string;
  }>;
  /** Expected version for optimistic locking */
  expectedVersion?: number;
}

/**
 * Response from save social links API.
 */
export interface SaveSocialLinksResponse {
  success: boolean;
  version?: number;
}

/**
 * API response for social links fetch.
 */
interface SocialLinksResponse {
  links: DashboardSocialLink[];
}

/**
 * Fetch social links for a profile.
 */
async function fetchSocialLinks(
  profileId: string,
  signal?: AbortSignal
): Promise<DashboardSocialLink[]> {
  const response = await fetchWithTimeout<SocialLinksResponse>(
    `/api/dashboard/social-links?profileId=${encodeURIComponent(profileId)}`,
    { signal, cache: 'no-store' }
  );
  return response.links || [];
}

/**
 * Save social links for a profile (batch PUT).
 * Returns the new version number for optimistic locking.
 */
async function saveSocialLinks(
  input: SaveSocialLinksInput
): Promise<SaveSocialLinksResponse> {
  const response = await fetchWithTimeout<SaveSocialLinksResponse>(
    '/api/dashboard/social-links',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  return response;
}

/**
 * Query hook for fetching dashboard social links.
 *
 * @param profileId - The profile ID to fetch social links for
 *
 * @example
 * ```tsx
 * const { data: socialLinks, isLoading, error } = useDashboardSocialLinksQuery(profileId);
 * ```
 */
export function useDashboardSocialLinksQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.dashboard.socialLinks(profileId),
    queryFn: ({ signal }) => fetchSocialLinks(profileId, signal),
    enabled: Boolean(profileId),
    staleTime: 30_000, // Consider fresh for 30 seconds
  });
}

/**
 * Mutation hook for saving dashboard social links.
 *
 * @param profileId - The profile ID for cache invalidation
 *
 * @example
 * ```tsx
 * const { mutateAsync: saveSocialLinks, isPending } = useSaveSocialLinksMutation(profileId);
 *
 * const handleSave = async (links: SocialLink[]) => {
 *   await saveSocialLinks({
 *     profileId,
 *     links: links.map((link, i) => ({
 *       platform: link.platform,
 *       platformType: link.platform,
 *       url: link.url,
 *       sortOrder: i,
 *       isActive: true,
 *     })),
 *   });
 * };
 * ```
 */
export function useSaveSocialLinksMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['dashboard', 'social-links', 'save', profileId],
    mutationFn: saveSocialLinks,

    onSuccess: (_data, variables) => {
      handleMutationSuccess('Social links saved');
      track('dashboard_social_links_saved', { profileId: variables.profileId });

      // Invalidate social links queries to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.socialLinks(variables.profileId),
      });
      // Also invalidate suggestions since they may have changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.suggestions.list(variables.profileId),
      });
    },

    onError: error => {
      handleMutationError(error, 'Failed to save social links');
    },
  });
}
