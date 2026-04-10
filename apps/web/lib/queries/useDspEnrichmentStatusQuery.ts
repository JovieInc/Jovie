'use client';

/**
 * DSP Enrichment Status Query Hook
 *
 * Tracks the progress of DSP enrichment jobs with polling.
 * Shows status of discovery, track matching, and profile enrichment.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { DspProviderId } from '@/lib/dsp-enrichment/types';

import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

// ============================================================================
// Types
// ============================================================================

/**
 * Enrichment phase states
 */
export type EnrichmentPhase =
  | 'idle'
  | 'discovering'
  | 'matching'
  | 'enriching'
  | 'complete'
  | 'failed';

/**
 * Per-provider enrichment status
 */
export interface ProviderEnrichmentStatus {
  providerId: DspProviderId;
  phase: EnrichmentPhase;
  progress: number; // 0-100
  tracksEnriched: number;
  totalTracks: number;
  lastError: string | null;
  lastUpdatedAt: string;
}

/**
 * Overall enrichment status for a profile
 */
export interface EnrichmentStatus {
  profileId: string;
  overallPhase: EnrichmentPhase;
  overallProgress: number;
  providers: ProviderEnrichmentStatus[];
  discoveryStartedAt: string | null;
  discoveryCompletedAt: string | null;
  enrichmentStartedAt: string | null;
  enrichmentCompletedAt: string | null;
}

/**
 * API response structure
 */
interface EnrichmentStatusResponse {
  success: boolean;
  status: EnrichmentStatus;
  error?: string;
}

/**
 * Query options
 */
export interface UseDspEnrichmentStatusQueryOptions {
  profileId: string;
  enabled?: boolean;
  /**
   * Polling interval in ms. Set to false to disable polling.
   * Default: 5000ms when processing, false when complete/idle.
   */
  refetchInterval?: number | false;
  /**
   * Called when enrichment transitions from an active phase to complete.
   * Use this to trigger page refreshes or other side effects.
   * Must be stable (for example wrapped in `useCallback`) to avoid unnecessary
   * effect re-runs.
   */
  onComplete?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Default polling interval while processing */
const DEFAULT_POLLING_INTERVAL_MS = 5000;
const BACKOFF_POLLING_INTERVAL_MS = 10000;
const IDLE_POLLS_BEFORE_BACKOFF = 3;

/** Active phases that should trigger polling */
const ACTIVE_PHASES = new Set<EnrichmentPhase>([
  'discovering',
  'matching',
  'enriching',
]);

// ============================================================================
// Fetch Function
// ============================================================================

async function fetchEnrichmentStatus(
  profileId: string,
  signal?: AbortSignal
): Promise<EnrichmentStatus> {
  const url = `/api/dsp/enrichment/status?profileId=${encodeURIComponent(profileId)}`;

  const response = await fetchWithTimeout<EnrichmentStatusResponse>(url, {
    signal,
  });

  if (!response.success) {
    throw new Error(response.error ?? 'Failed to fetch enrichment status');
  }

  return response.status;
}

// ============================================================================
// Query Hook
// ============================================================================

/**
 * Query hook for tracking DSP enrichment progress.
 *
 * Automatically polls when enrichment is in progress (discovering, matching,
 * or enriching phases). Polling stops when complete or idle.
 *
 * @example
 * const { data: status, isLoading } = useDspEnrichmentStatusQuery({
 *   profileId: 'profile-123',
 * });
 *
 * // Custom polling interval
 * const { data } = useDspEnrichmentStatusQuery({
 *   profileId: 'profile-123',
 *   refetchInterval: 2000, // Poll every 2s
 * });
 */
export function useDspEnrichmentStatusQuery({
  profileId,
  enabled = true,
  refetchInterval,
  onComplete,
}: UseDspEnrichmentStatusQueryOptions) {
  const queryClient = useQueryClient();
  const [pollIntervalMs, setPollIntervalMs] = useState(
    DEFAULT_POLLING_INTERVAL_MS
  );
  const stagnantPollCountRef = useRef(0);
  const lastPhaseRef = useRef<EnrichmentPhase | null>(null);

  // Skip refetch on mount when polling is already handling freshness
  const cachedData = queryClient.getQueryData<EnrichmentStatus>(
    queryKeys.dspEnrichment.status(profileId)
  );
  const isPolling =
    cachedData != null && ACTIVE_PHASES.has(cachedData.overallPhase);

  const query = useQuery<EnrichmentStatus>({
    queryKey: queryKeys.dspEnrichment.status(profileId),
    queryFn: ({ signal }) => fetchEnrichmentStatus(profileId, signal),
    enabled: enabled && !!profileId,
    staleTime: 5000, // Match polling interval to avoid refetching between polls
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: !isPolling,
    refetchOnWindowFocus: false, // Polling handles freshness

    // Dynamic polling: only poll when enrichment is active
    refetchInterval: query => {
      // Use explicit interval if provided
      if (refetchInterval !== undefined) {
        return refetchInterval;
      }

      // Otherwise, auto-detect based on current state
      const status = query.state.data;
      if (!status) return false;

      // Poll only during active phases
      if (ACTIVE_PHASES.has(status.overallPhase)) {
        return pollIntervalMs;
      }

      return false;
    },
    refetchIntervalInBackground: false,

    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  useEffect(() => {
    if (!enabled || !profileId) {
      return;
    }

    setPollIntervalMs(DEFAULT_POLLING_INTERVAL_MS);
    stagnantPollCountRef.current = 0;
    lastPhaseRef.current = null;
  }, [enabled, profileId]);

  useEffect(() => {
    const currentPhase = query.data?.overallPhase;
    if (currentPhase == null || !ACTIVE_PHASES.has(currentPhase)) {
      stagnantPollCountRef.current = 0;
      lastPhaseRef.current = null;
      if (pollIntervalMs !== DEFAULT_POLLING_INTERVAL_MS) {
        setPollIntervalMs(DEFAULT_POLLING_INTERVAL_MS);
      }
      return;
    }

    if (currentPhase === lastPhaseRef.current) {
      stagnantPollCountRef.current += 1;
    } else {
      lastPhaseRef.current = currentPhase;
      stagnantPollCountRef.current = 0;
      if (pollIntervalMs !== DEFAULT_POLLING_INTERVAL_MS) {
        setPollIntervalMs(DEFAULT_POLLING_INTERVAL_MS);
      }
    }

    if (
      stagnantPollCountRef.current >= IDLE_POLLS_BEFORE_BACKOFF &&
      pollIntervalMs !== BACKOFF_POLLING_INTERVAL_MS
    ) {
      setPollIntervalMs(BACKOFF_POLLING_INTERVAL_MS);
    }
  }, [query.data?.overallPhase, pollIntervalMs]);

  // Track phase transitions: fire callback when enrichment finishes or new data appears.
  // Triggers on: active → complete, discovering → non-discovering (new matches found)
  const prevPhaseRef = useRef<EnrichmentPhase | undefined>(undefined);
  const prevProfileIdRef = useRef(profileId);
  useEffect(() => {
    const currentPhase = query.data?.overallPhase;
    const prevProfileId = prevProfileIdRef.current;
    prevProfileIdRef.current = profileId;

    if (prevProfileId !== profileId) {
      prevPhaseRef.current = currentPhase;
      return;
    }

    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = currentPhase;

    if (prevPhase == null || currentPhase == null || prevPhase === currentPhase)
      return;

    const shouldRefresh =
      // Active → complete: full enrichment finished
      (ACTIVE_PHASES.has(prevPhase) && currentPhase === 'complete') ||
      // Discovering → matching/enriching/complete: discovery produced new data
      (prevPhase === 'discovering' &&
        currentPhase !== 'discovering' &&
        currentPhase !== 'failed');

    if (shouldRefresh) {
      // Invalidate matches cache so any mounted matches queries get fresh data
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.dspEnrichment.all, 'matches', profileId],
      });
      onComplete?.();
    }
  }, [query.data?.overallPhase, profileId, queryClient, onComplete]);

  return query;
}

// ============================================================================
// Derived State Helpers
// ============================================================================

/**
 * Check if enrichment is currently in progress
 */
export function isEnrichmentInProgress(
  status: EnrichmentStatus | undefined
): boolean {
  if (!status) return false;
  return ACTIVE_PHASES.has(status.overallPhase);
}

/**
 * Check if enrichment has completed successfully
 */
export function isEnrichmentComplete(
  status: EnrichmentStatus | undefined
): boolean {
  if (!status) return false;
  return status.overallPhase === 'complete';
}

/**
 * Get human-readable phase label
 */
export function getPhaseLabel(phase: EnrichmentPhase): string {
  switch (phase) {
    case 'idle':
      return 'Ready';
    case 'discovering':
      return 'Discovering profiles...';
    case 'matching':
      return 'Matching artists...';
    case 'enriching':
      return 'Enriching tracks...';
    case 'complete':
      return 'Complete';
    case 'failed':
      return 'Failed';
    default:
      return 'Unknown';
  }
}

/**
 * Calculate total tracks enriched across all providers
 */
export function getTotalTracksEnriched(status: EnrichmentStatus): number {
  return status.providers.reduce(
    (total, provider) => total + provider.tracksEnriched,
    0
  );
}
