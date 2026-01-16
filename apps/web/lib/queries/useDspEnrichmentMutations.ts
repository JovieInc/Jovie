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
      // Invalidate matches list (status changed)
      queryClient.invalidateQueries({
        queryKey: queryKeys.dspEnrichment.matches(variables.profileId),
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
      // Invalidate matches list (status changed)
      queryClient.invalidateQueries({
        queryKey: queryKeys.dspEnrichment.matches(variables.profileId),
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
