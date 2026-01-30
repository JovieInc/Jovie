'use client';

/**
 * DSP Matches Query Hook
 *
 * Fetches DSP artist match suggestions for a creator profile.
 * Returns matches with confidence scores from various providers
 * (Apple Music, Deezer, etc.) that can be confirmed or rejected.
 */

import { useQuery } from '@tanstack/react-query';

import type { DspMatchStatus, DspProviderId } from '@/lib/dsp-enrichment/types';

import { STANDARD_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

// ============================================================================
// Types
// ============================================================================

/**
 * DSP match data returned from the API
 */
export interface DspMatch {
  id: string;
  providerId: DspProviderId;
  externalArtistId: string;
  externalArtistName: string;
  externalArtistUrl: string | null;
  externalArtistImageUrl: string | null;
  confidenceScore: number;
  confidenceBreakdown: {
    isrcMatchScore: number;
    upcMatchScore: number;
    nameSimilarityScore: number;
    followerRatioScore: number;
    genreOverlapScore: number;
  };
  matchingIsrcCount: number;
  matchingUpcCount: number;
  totalTracksChecked: number;
  status: DspMatchStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * API response structure
 */
interface DspMatchesResponse {
  success: boolean;
  matches: DspMatch[];
  error?: string;
}

/**
 * Query options
 */
export interface UseDspMatchesQueryOptions {
  profileId: string;
  status?: DspMatchStatus | 'all';
  enabled?: boolean;
}

// ============================================================================
// Fetch Function
// ============================================================================

async function fetchDspMatches(
  profileId: string,
  status?: DspMatchStatus | 'all',
  signal?: AbortSignal
): Promise<DspMatch[]> {
  const params = new URLSearchParams();
  if (status && status !== 'all') {
    params.set('status', status);
  }

  const url = `/api/dsp/matches?profileId=${encodeURIComponent(profileId)}${
    params.toString() ? `&${params.toString()}` : ''
  }`;

  const response = await fetchWithTimeout<DspMatchesResponse>(url, { signal });

  if (!response.success) {
    throw new Error(response.error ?? 'Failed to fetch DSP matches');
  }

  return response.matches;
}

// ============================================================================
// Query Hook
// ============================================================================

/**
 * Query hook for fetching DSP match suggestions.
 *
 * @example
 * const { data: matches, isLoading } = useDspMatchesQuery({
 *   profileId: 'profile-123',
 *   status: 'suggested', // Only show suggestions
 * });
 */
export function useDspMatchesQuery({
  profileId,
  status,
  enabled = true,
}: UseDspMatchesQueryOptions) {
  return useQuery<DspMatch[]>({
    // Include status in cache key so different filters have separate caches
    queryKey: queryKeys.dspEnrichment.matches(profileId, status),
    queryFn: ({ signal }) => fetchDspMatches(profileId, status, signal),
    enabled: enabled && !!profileId,
    // STANDARD_CACHE: 5 min stale, 30 min gc
    ...STANDARD_CACHE,
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

// ============================================================================
// Derived State Helpers
// ============================================================================

/**
 * Get matches grouped by provider
 */
export function groupMatchesByProvider(
  matches: DspMatch[]
): Map<DspProviderId, DspMatch[]> {
  const grouped = new Map<DspProviderId, DspMatch[]>();

  for (const match of matches) {
    const existing = grouped.get(match.providerId) ?? [];
    existing.push(match);
    grouped.set(match.providerId, existing);
  }

  return grouped;
}

/**
 * Get the best match for each provider (highest confidence)
 */
export function getBestMatchPerProvider(
  matches: DspMatch[]
): Map<DspProviderId, DspMatch> {
  const grouped = groupMatchesByProvider(matches);
  const best = new Map<DspProviderId, DspMatch>();

  for (const [provider, providerMatches] of grouped) {
    const sorted = [...providerMatches].sort(
      (a, b) => b.confidenceScore - a.confidenceScore
    );
    if (sorted[0]) {
      best.set(provider, sorted[0]);
    }
  }

  return best;
}

/**
 * Count matches by status
 */
export function countMatchesByStatus(
  matches: DspMatch[]
): Record<DspMatchStatus, number> {
  const counts: Record<DspMatchStatus, number> = {
    suggested: 0,
    confirmed: 0,
    rejected: 0,
    auto_confirmed: 0,
  };

  for (const match of matches) {
    counts[match.status]++;
  }

  return counts;
}
