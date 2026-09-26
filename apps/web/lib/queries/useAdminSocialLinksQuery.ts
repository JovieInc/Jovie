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
  platform: string;
  platformType: string;
}

// Per-platform identity evidence from the enrichment stage (JOV-6529).
export type AdminIdentityLinkStatus =
  | 'verified'
  | 'not_found'
  | 'not_checked'
  | 'conflicted';

export interface AdminIdentityPlatformStatus {
  status: AdminIdentityLinkStatus;
  observedAt: string;
  sources: readonly string[];
  conflicts?: readonly string[];
}

export interface AdminIdentityEnrichment {
  observedAt: string;
  shareReadiness: 'ready' | 'limited';
  platformStatus: Record<string, AdminIdentityPlatformStatus>;
}

/**
 * API response structure
 */
interface AdminSocialLinksResponse {
  success: boolean;
  links?: AdminSocialLink[];
  identityEnrichment?: AdminIdentityEnrichment | null;
  error?: string;
}

export interface AdminSocialLinksData {
  links: AdminSocialLink[];
  /** Null when the enrichment pass has never run for this profile. */
  identityEnrichment: AdminIdentityEnrichment | null;
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
): Promise<AdminSocialLinksData> {
  const url = `/api/admin/creator-social-links?profileId=${encodeURIComponent(profileId)}`;

  const response = await fetchWithTimeout<AdminSocialLinksResponse>(url, {
    signal,
  });

  if (!response.success || !response.links) {
    throw new Error(response.error ?? 'Failed to fetch social links');
  }

  return {
    links: response.links,
    identityEnrichment: response.identityEnrichment ?? null,
  };
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
    // STANDARD_CACHE settings (with refetchOnMount disabled to prevent
    // unnecessary fetches when switching between profiles in admin table)
    staleTime: 5 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchOnMount: false,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: process.env.NODE_ENV === 'production',
  });
}
