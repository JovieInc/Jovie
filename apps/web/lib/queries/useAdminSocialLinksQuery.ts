'use client';

/**
 * Admin Social Links Query Hook
 *
 * TanStack Query hook for fetching social links in the admin sidebar.
 * Uses STANDARD_CACHE (5 min staleTime) to avoid refetching on every selection.
 */

import { useQuery } from '@tanstack/react-query';

import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

// Time constants (matching cache-strategies.ts)
const MINUTE = 60 * 1000;

/**
 * Social link data returned from the admin API
 */
export interface AdminSocialLink {
  id: string;
  label: string;
  url: string;
  platformType: string;
}

/**
 * API response structure
 */
interface AdminSocialLinksResponse {
  success: boolean;
  links?: AdminSocialLink[];
  error?: string;
}

/**
 * Query options
 */
export interface UseAdminSocialLinksQueryOptions {
  profileId: string | undefined;
  /** Whether to fetch. Defaults to true when profileId is provided. */
  enabled?: boolean;
}

async function fetchAdminSocialLinks(
  profileId: string,
  signal?: AbortSignal
): Promise<AdminSocialLink[]> {
  const url = `/api/admin/creator-social-links?profileId=${encodeURIComponent(profileId)}`;

  const response = await fetchWithTimeout<AdminSocialLinksResponse>(url, {
    signal,
  });

  if (!response.success || !response.links) {
    throw new Error(response.error ?? 'Failed to fetch social links');
  }

  return response.links;
}

/**
 * Query hook for fetching admin social links with caching.
 *
 * Uses STANDARD_CACHE strategy (5 min staleTime) to avoid unnecessary
 * refetches when switching between rows in the admin table.
 *
 * @example
 * const { data: links, isLoading } = useAdminSocialLinksQuery({
 *   profileId: selectedProfileId,
 *   enabled: sidebarOpen,
 * });
 */
export function useAdminSocialLinksQuery({
  profileId,
  enabled = true,
}: UseAdminSocialLinksQueryOptions) {
  return useQuery({
    queryKey: queryKeys.creators.socialLinks(profileId ?? ''),
    queryFn: ({ signal }) => fetchAdminSocialLinks(profileId!, signal),
    enabled: enabled && !!profileId,
    // STANDARD_CACHE settings
    staleTime: 5 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchOnMount: true,
    refetchOnWindowFocus: process.env.NODE_ENV === 'production',
  });
}
