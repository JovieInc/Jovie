/**
 * DSP Enrichment Status Query Hook
 *
 * Tracks the progress of DSP enrichment jobs with polling.
 * Shows status of discovery, track matching, and profile enrichment.
 */

import { useQuery } from '@tanstack/react-query';

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
}

// ============================================================================
// Constants
// ============================================================================

/** Default polling interval while processing */
const DEFAULT_POLLING_INTERVAL_MS = 5000;

/** Active phases that should trigger polling */
const ACTIVE_PHASES: EnrichmentPhase[] = [
  'discovering',
  'matching',
  'enriching',
];

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
}: UseDspEnrichmentStatusQueryOptions) {
  return useQuery<EnrichmentStatus>({
    queryKey: queryKeys.dspEnrichment.status(profileId),
    queryFn: ({ signal }) => fetchEnrichmentStatus(profileId, signal),
    enabled: enabled && !!profileId,
    staleTime: 1000, // Very short stale time for real-time updates
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: true,
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
      if (ACTIVE_PHASES.includes(status.overallPhase)) {
        return DEFAULT_POLLING_INTERVAL_MS;
      }

      return false;
    },
    refetchIntervalInBackground: false,

    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
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
  return ACTIVE_PHASES.includes(status.overallPhase);
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
