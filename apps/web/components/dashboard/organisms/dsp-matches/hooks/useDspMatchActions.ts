'use client';

import { useCallback, useState } from 'react';

import type { ConfidenceBreakdownData } from '@/components/dashboard/molecules/MatchConfidenceBreakdown';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import {
  useConfirmDspMatchMutation,
  useRejectDspMatchMutation,
} from '@/lib/queries/useDspEnrichmentMutations';

/**
 * Match data for the confirmation dialog.
 */
export interface MatchForDialog {
  matchId: string;
  providerId: DspProviderId;
  externalArtistName: string;
  externalArtistUrl?: string | null;
  externalArtistImageUrl?: string | null;
  confidenceScore: number;
  confidenceBreakdown?: ConfidenceBreakdownData;
  matchingIsrcCount: number;
}

interface UseDspMatchActionsOptions {
  profileId: string;
  onConfirmSuccess?: (matchId: string) => void;
  onRejectSuccess?: (matchId: string) => void;
  onError?: (error: Error, action: 'confirm' | 'reject') => void;
}

/**
 * useDspMatchActions - Hook for managing DSP match actions with dialog state.
 *
 * Combines mutation hooks with dialog state management for a complete
 * confirm/reject workflow.
 *
 * @example
 * const {
 *   // Dialog state
 *   dialogMatch,
 *   isDialogOpen,
 *   openConfirmDialog,
 *   closeDialog,
 *
 *   // Direct actions (no dialog)
 *   confirmMatch,
 *   rejectMatch,
 *
 *   // Dialog action
 *   confirmDialogMatch,
 *
 *   // Loading states
 *   isConfirming,
 *   isRejecting,
 *   confirmingMatchId,
 *   rejectingMatchId,
 * } = useDspMatchActions({ profileId });
 */
export function useDspMatchActions({
  profileId,
  onConfirmSuccess,
  onRejectSuccess,
  onError,
}: UseDspMatchActionsOptions) {
  // Dialog state
  const [dialogMatch, setDialogMatch] = useState<MatchForDialog | null>(null);
  const isDialogOpen = dialogMatch !== null;

  // Mutations
  const confirmMutation = useConfirmDspMatchMutation();
  const rejectMutation = useRejectDspMatchMutation();

  // Loading state helpers
  const isConfirming = confirmMutation.isPending;
  const isRejecting = rejectMutation.isPending;
  const confirmingMatchId = confirmMutation.isPending
    ? confirmMutation.variables?.matchId
    : null;
  const rejectingMatchId = rejectMutation.isPending
    ? rejectMutation.variables?.matchId
    : null;

  /**
   * Open the confirmation dialog for a match.
   */
  const openConfirmDialog = useCallback((match: MatchForDialog) => {
    setDialogMatch(match);
  }, []);

  /**
   * Close the confirmation dialog.
   */
  const closeDialog = useCallback(() => {
    setDialogMatch(null);
  }, []);

  /**
   * Confirm a match directly (without dialog).
   */
  const confirmMatch = useCallback(
    (matchId: string) => {
      confirmMutation.mutate(
        { matchId, profileId },
        {
          onSuccess: () => {
            onConfirmSuccess?.(matchId);
          },
          onError: error => {
            onError?.(error as Error, 'confirm');
          },
        }
      );
    },
    [confirmMutation, profileId, onConfirmSuccess, onError]
  );

  /**
   * Confirm the match currently in the dialog.
   */
  const confirmDialogMatch = useCallback(() => {
    if (!dialogMatch) return;

    confirmMutation.mutate(
      { matchId: dialogMatch.matchId, profileId },
      {
        onSuccess: () => {
          closeDialog();
          onConfirmSuccess?.(dialogMatch.matchId);
        },
        onError: error => {
          onError?.(error as Error, 'confirm');
        },
      }
    );
  }, [
    confirmMutation,
    dialogMatch,
    profileId,
    closeDialog,
    onConfirmSuccess,
    onError,
  ]);

  /**
   * Reject a match.
   */
  const rejectMatch = useCallback(
    (matchId: string, reason?: string) => {
      rejectMutation.mutate(
        { matchId, profileId, reason },
        {
          onSuccess: () => {
            onRejectSuccess?.(matchId);
          },
          onError: error => {
            onError?.(error as Error, 'reject');
          },
        }
      );
    },
    [rejectMutation, profileId, onRejectSuccess, onError]
  );

  /**
   * Check if a specific match is currently being confirmed.
   */
  const isMatchConfirming = useCallback(
    (matchId: string) => confirmingMatchId === matchId,
    [confirmingMatchId]
  );

  /**
   * Check if a specific match is currently being rejected.
   */
  const isMatchRejecting = useCallback(
    (matchId: string) => rejectingMatchId === matchId,
    [rejectingMatchId]
  );

  return {
    // Dialog state
    dialogMatch,
    isDialogOpen,
    openConfirmDialog,
    closeDialog,

    // Direct actions
    confirmMatch,
    rejectMatch,

    // Dialog action
    confirmDialogMatch,

    // Global loading states
    isConfirming,
    isRejecting,

    // Per-match loading checks
    confirmingMatchId,
    rejectingMatchId,
    isMatchConfirming,
    isMatchRejecting,
  };
}
