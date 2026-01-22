'use client';

/**
 * Suggestions Query Hook
 *
 * TanStack Query hook for fetching and polling social link suggestions.
 * Supports dynamic polling intervals with exponential backoff.
 */

import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions/social-links';
import { queryKeys } from './keys';

export interface SuggestionsQueryResult {
  links: ProfileSocialLink[];
  maxVersion: number;
}

/** Polling interval configuration */
const POLLING_CONFIG = {
  /** Initial polling interval in ms */
  initialInterval: 2000,
  /** Maximum polling interval in ms */
  maxInterval: 30000,
  /** Multiplier for exponential backoff */
  backoffMultiplier: 1.5,
  /** Number of unchanged responses before backing off */
  stableCountThreshold: 3,
} as const;

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
  /**
   * Polling behavior configuration.
   * - number: Fixed polling interval in ms
   * - false: Disable polling
   * - 'adaptive': Use exponential backoff (default)
   */
  refetchInterval?: number | false | 'adaptive';
  /** Force fast polling mode (resets backoff). Useful after user actions. */
  fastPolling?: boolean;
  /** Optional initial data to seed the cache and skip the first fetch. */
  initialData?: SuggestionsQueryResult | undefined;
}

/**
 * Query hook for fetching social link suggestions with adaptive polling.
 *
 * Features exponential backoff: starts polling quickly, then slows down
 * when data stops changing to reduce unnecessary requests.
 *
 * @example
 * ```tsx
 * // Basic usage with adaptive polling (default)
 * const { data, isLoading } = useSuggestionsQuery({
 *   profileId,
 *   enabled: true,
 * });
 *
 * // Force fast polling after user action
 * const { data } = useSuggestionsQuery({
 *   profileId,
 *   enabled: true,
 *   fastPolling: autoRefreshMode,
 * });
 *
 * // Fixed interval polling
 * const { data } = useSuggestionsQuery({
 *   profileId,
 *   refetchInterval: 5000,
 * });
 * ```
 */
export function useSuggestionsQuery({
  profileId,
  enabled = true,
  refetchInterval = 'adaptive',
  fastPolling = false,
  initialData,
}: UseSuggestionsQueryOptions) {
  // Track consecutive unchanged responses for backoff
  const stableCountRef = useRef(0);
  const currentIntervalRef = useRef<number>(POLLING_CONFIG.initialInterval);
  const lastVersionRef = useRef<number | null>(null);

  // Reset backoff when fast polling is requested
  if (fastPolling) {
    stableCountRef.current = 0;
    currentIntervalRef.current = POLLING_CONFIG.initialInterval;
  }

  // Calculate adaptive interval based on data stability
  const getAdaptiveInterval = useCallback(
    (data: SuggestionsQueryResult | undefined): number => {
      if (!data) {
        return POLLING_CONFIG.initialInterval;
      }

      // Check if data has changed
      if (
        lastVersionRef.current !== null &&
        data.maxVersion === lastVersionRef.current
      ) {
        stableCountRef.current++;
      } else {
        // Data changed, reset backoff
        stableCountRef.current = 0;
        currentIntervalRef.current = POLLING_CONFIG.initialInterval;
      }

      lastVersionRef.current = data.maxVersion;

      // Apply backoff if data has been stable
      if (stableCountRef.current >= POLLING_CONFIG.stableCountThreshold) {
        currentIntervalRef.current = Math.min(
          currentIntervalRef.current * POLLING_CONFIG.backoffMultiplier,
          POLLING_CONFIG.maxInterval
        );
      }

      return currentIntervalRef.current;
    },
    []
  );

  const isDocumentVisible = () =>
    typeof document === 'undefined' || document.visibilityState === 'visible';

  return useQuery<SuggestionsQueryResult>({
    queryKey: queryKeys.suggestions.list(profileId ?? ''),
    queryFn: ({ signal }) => fetchSuggestions(profileId!, signal),
    enabled: enabled && !!profileId,
    initialData,
    select: data => ({ links: data.links, maxVersion: data.maxVersion }),
    refetchInterval: query => {
      if (!isDocumentVisible()) return false;
      if (refetchInterval === 'adaptive') {
        return getAdaptiveInterval(query.state.data);
      }
      return typeof refetchInterval === 'number' ? refetchInterval : false;
    },
    // Don't refetch on window focus since we're already polling
    refetchOnWindowFocus: false,
    staleTime: 1 * 60 * 1000, // 1 min
    gcTime: 10 * 60 * 1000, // 10 min
    refetchOnMount: true,
    structuralSharing: true,
  });
}
