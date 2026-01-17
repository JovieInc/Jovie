/**
 * DSP Enrichment Mutations
 *
 * Mutations for managing DSP artist matches:
 * - Confirm suggested matches
 * - Reject suggested matches
 * - Trigger discovery for new profiles
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { DspProviderId } from '@/lib/dsp-enrichment/types';

import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

// ============================================================================
// Validation
// ============================================================================

/**
 * UUID v4 regex pattern for validation.
 * Matches: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate a UUID v4 string.
 *
 * @param id - String to validate
 * @returns True if valid UUID v4
 */
function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

// ============================================================================
// Types
// ============================================================================

/**
 * Input for confirming a DSP match
 */
export interface ConfirmDspMatchInput {
  matchId: string;
  profileId: string;
}

/**
 * Input for rejecting a DSP match
 */
export interface RejectDspMatchInput {
  matchId: string;
  profileId: string;
  reason?: string;
}

/**
 * Input for triggering DSP discovery
 */
export interface TriggerDiscoveryInput {
  profileId: string;
  spotifyArtistId: string;
  targetProviders?: DspProviderId[];
}

/**
 * Response from match confirmation
 */
export interface ConfirmDspMatchResponse {
  success: boolean;
  matchId: string;
  enrichmentJobId?: string;
  error?: string;
}

/**
 * Response from match rejection
 */
export interface RejectDspMatchResponse {
  success: boolean;
  matchId: string;
  error?: string;
}

/**
 * Response from discovery trigger
 */
export interface TriggerDiscoveryResponse {
  success: boolean;
  jobId: string;
  targetProviders: DspProviderId[];
  error?: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function confirmDspMatch(
  input: ConfirmDspMatchInput
): Promise<ConfirmDspMatchResponse> {
  // Validate matchId format to prevent invalid URL paths
  if (!isValidUuid(input.matchId)) {
    throw new Error(`Invalid matchId format: ${input.matchId}`);
  }
  if (!isValidUuid(input.profileId)) {
    throw new Error(`Invalid profileId format: ${input.profileId}`);
  }

  const response = await fetchWithTimeout<ConfirmDspMatchResponse>(
    `/api/dsp/matches/${input.matchId}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: input.profileId }),
    }
  );

  if (!response.success) {
    throw new Error(response.error ?? 'Failed to confirm match');
  }

  return response;
}

async function rejectDspMatch(
  input: RejectDspMatchInput
): Promise<RejectDspMatchResponse> {
  // Validate matchId format to prevent invalid URL paths
  if (!isValidUuid(input.matchId)) {
    throw new Error(`Invalid matchId format: ${input.matchId}`);
  }
  if (!isValidUuid(input.profileId)) {
    throw new Error(`Invalid profileId format: ${input.profileId}`);
  }

  const response = await fetchWithTimeout<RejectDspMatchResponse>(
    `/api/dsp/matches/${input.matchId}/reject`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: input.profileId,
        reason: input.reason,
      }),
    }
  );

  if (!response.success) {
    throw new Error(response.error ?? 'Failed to reject match');
  }

  return response;
}

async function triggerDspDiscovery(
  input: TriggerDiscoveryInput
): Promise<TriggerDiscoveryResponse> {
  // Validate profileId before making API call
  if (!isValidUuid(input.profileId)) {
    throw new Error(`Invalid profile ID format: ${input.profileId}`);
  }

  const response = await fetchWithTimeout<TriggerDiscoveryResponse>(
    '/api/dsp/discover',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  if (!response.success) {
    throw new Error(response.error ?? 'Failed to trigger discovery');
  }

  return response;
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Mutation hook for confirming a DSP match.
 *
 * After confirmation, triggers track enrichment job and invalidates
 * related queries.
 *
 * @example
 * const { mutate: confirmMatch, isPending } = useConfirmDspMatchMutation();
 *
 * confirmMatch({
 *   matchId: 'match-123',
 *   profileId: 'profile-456',
 * });
 */
export function useConfirmDspMatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: confirmDspMatch,

    onSuccess: (data, variables) => {
      // Invalidate ALL matches caches for this profile (regardless of status filter)
      // Use partial key match to invalidate ['dsp-enrichment', 'matches', profileId, *]
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.dspEnrichment.all,
          'matches',
          variables.profileId,
        ],
      });

      // Invalidate enrichment status (new job started)
      queryClient.invalidateQueries({
        queryKey: queryKeys.dspEnrichment.status(variables.profileId),
      });

      // Invalidate releases (DSP links will be added)
      queryClient.invalidateQueries({
        queryKey: queryKeys.releases.matrix(variables.profileId),
      });
    },

    onError: (error, variables) => {
      // Log error for monitoring
      console.error(
        `[DSP] Failed to confirm match ${variables.matchId}:`,
        error
      );
    },
  });
}

/**
 * Mutation hook for rejecting a DSP match.
 *
 * @example
 * const { mutate: rejectMatch, isPending } = useRejectDspMatchMutation();
 *
 * rejectMatch({
 *   matchId: 'match-123',
 *   profileId: 'profile-456',
 *   reason: 'Not the same artist',
 * });
 */
export function useRejectDspMatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rejectDspMatch,

    onSuccess: (_, variables) => {
      // Invalidate ALL matches caches for this profile (regardless of status filter)
      // Use partial key match to invalidate ['dsp-enrichment', 'matches', profileId, *]
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.dspEnrichment.all,
          'matches',
          variables.profileId,
        ],
      });
    },

    onError: (error, variables) => {
      console.error(
        `[DSP] Failed to reject match ${variables.matchId}:`,
        error
      );
    },
  });
}

/**
 * Mutation hook for triggering DSP discovery.
 *
 * Call this after a user connects their Spotify profile to automatically
 * discover matching profiles on other platforms.
 *
 * @example
 * const { mutate: triggerDiscovery, isPending } = useTriggerDiscoveryMutation();
 *
 * // After Spotify connection
 * triggerDiscovery({
 *   profileId: 'profile-123',
 *   spotifyArtistId: '4Z8W4fKeB5YxbusRsdQVPb',
 *   targetProviders: ['apple_music', 'deezer'],
 * });
 */
export function useTriggerDiscoveryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerDspDiscovery,

    onSuccess: (_, variables) => {
      // Invalidate enrichment status (discovery started)
      queryClient.invalidateQueries({
        queryKey: queryKeys.dspEnrichment.status(variables.profileId),
      });

      // The matches query will be updated when discovery completes
      // via polling in useDspEnrichmentStatusQuery
    },

    onError: (error, variables) => {
      console.error(
        `[DSP] Failed to trigger discovery for profile ${variables.profileId}:`,
        error
      );
    },

    // Discovery is not idempotent, so don't retry automatically
    retry: false,
  });
}

// ============================================================================
// Combined Hook (Convenience)
// ============================================================================

/**
 * Combined hook returning all DSP enrichment mutations.
 *
 * @example
 * const { confirmMatch, rejectMatch, triggerDiscovery } = useDspEnrichmentMutations();
 */
export function useDspEnrichmentMutations() {
  const confirmMutation = useConfirmDspMatchMutation();
  const rejectMutation = useRejectDspMatchMutation();
  const discoveryMutation = useTriggerDiscoveryMutation();

  return {
    confirmMatch: confirmMutation,
    rejectMatch: rejectMutation,
    triggerDiscovery: discoveryMutation,
  };
}
