'use client';

/**
 * Suggestions Query Hook
 *
 * TanStack Query hook for fetching and polling social link suggestions.
 * Supports dynamic polling intervals with exponential backoff.
 */

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import { queryKeys } from './keys';

export interface SuggestionsQueryResult {
  links: ProfileSocialLink[];
  maxVersion: number;
}

/** Polling interval configuration */
const POLLING_CONFIG = {
  /** Initial polling interval in ms */
  initialInterval: 5000,
  /** Maximum polling interval in ms */
  maxInterval: 30000,
  /** Multiplier for exponential backoff */
  backoffMultiplier: 1.5,
  /** Number of unchanged responses before backing off */
  stableCountThreshold: 3,
  /** Initial error backoff interval in ms */
  errorInitialInterval: 4000,
  /** Maximum error backoff interval in ms */
  errorMaxInterval: 60000,
  /** Multiplier for error backoff */
  errorBackoffMultiplier: 2,
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
  /** Override polling behavior when external conditions pause polling. */
  pollingEnabled?: boolean;
  /** Optional initial data to seed the cache and skip the first fetch. */
  initialData?: SuggestionsQueryResult;
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
  pollingEnabled = true,
  initialData,
}: UseSuggestionsQueryOptions) {
  // Track consecutive unchanged responses for backoff
  const stableCountRef = useRef(0);
  const currentIntervalRef = useRef<number>(POLLING_CONFIG.initialInterval);
  const lastVersionRef = useRef<number | null>(null);
  const errorCountRef = useRef(0);
  const currentErrorIntervalRef = useRef<number>(
    POLLING_CONFIG.errorInitialInterval
  );
  const lastErrorUpdatedAtRef = useRef(0);
  const lastDataUpdatedAtRef = useRef(0);

  // Reset backoff when fast polling is requested
  useEffect(() => {
    if (fastPolling) {
      stableCountRef.current = 0;
      currentIntervalRef.current = POLLING_CONFIG.initialInterval;
      errorCountRef.current = 0;
      currentErrorIntervalRef.current = POLLING_CONFIG.errorInitialInterval;
      lastErrorUpdatedAtRef.current = 0;
    }
  }, [fastPolling]);

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

  return useQuery<SuggestionsQueryResult>({
    queryKey: queryKeys.suggestions.list(profileId ?? ''),
    queryFn: ({ signal }) => fetchSuggestions(profileId!, signal),
    enabled: enabled && !!profileId,
    initialData,
    select: data => ({ links: data.links, maxVersion: data.maxVersion }),
    refetchInterval: query => {
      if (!pollingEnabled) return false;

      const errorUpdatedAt = query.state.errorUpdatedAt ?? 0;
      const dataUpdatedAt = query.state.dataUpdatedAt ?? 0;

      if (errorUpdatedAt > lastErrorUpdatedAtRef.current) {
        errorCountRef.current += 1;
        currentErrorIntervalRef.current = Math.min(
          currentErrorIntervalRef.current *
            POLLING_CONFIG.errorBackoffMultiplier,
          POLLING_CONFIG.errorMaxInterval
        );
        lastErrorUpdatedAtRef.current = errorUpdatedAt;
      }

      if (
        dataUpdatedAt > lastDataUpdatedAtRef.current &&
        dataUpdatedAt > lastErrorUpdatedAtRef.current
      ) {
        errorCountRef.current = 0;
        currentErrorIntervalRef.current = POLLING_CONFIG.errorInitialInterval;
        lastDataUpdatedAtRef.current = dataUpdatedAt;
      }

      let baseInterval: number | false;
      if (refetchInterval === 'adaptive') {
        baseInterval = getAdaptiveInterval(query.state.data);
      } else if (typeof refetchInterval === 'number') {
        baseInterval = refetchInterval;
      } else {
        baseInterval = false;
      }

      if (baseInterval === false) return false;
      if (errorCountRef.current > 0) {
        return Math.max(baseInterval, currentErrorIntervalRef.current);
      }
      return baseInterval;
    },
    // Don't refetch on window focus since we're already polling
    refetchOnWindowFocus: false,
    staleTime: 1 * 60 * 1000, // 1 min
    gcTime: 10 * 60 * 1000, // 10 min
    refetchOnMount: true,
    structuralSharing: true,
  });
}
