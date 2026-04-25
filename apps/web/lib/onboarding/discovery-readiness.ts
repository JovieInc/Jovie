export type SpotifyImportStatus =
  | 'idle'
  | 'importing'
  | 'complete'
  | 'failed'
  | 'unknown';

export type OnboardingReadinessPhase =
  | 'connecting'
  | 'importing'
  | 'discovering'
  | 'waiting_for_first_release'
  | 'ready'
  | 'failed';

export type OnboardingBlockingReason =
  | 'missing_spotify_selection'
  | 'spotify_import_in_progress'
  | 'spotify_import_failed'
  | 'discovery_in_progress'
  | 'awaiting_first_release'
  | null;

export function parseSpotifyImportStatus(
  value: unknown,
  hasSpotifySelection: boolean
): SpotifyImportStatus {
  if (
    value === 'idle' ||
    value === 'importing' ||
    value === 'complete' ||
    value === 'failed'
  ) {
    return value;
  }

  return hasSpotifySelection ? 'unknown' : 'idle';
}

export function buildReadinessState({
  hasPendingDiscoveryJob,
  hasSpotifySelection,
  releaseCount,
  spotifyImportStatus,
}: {
  hasPendingDiscoveryJob: boolean;
  hasSpotifySelection: boolean;
  releaseCount: number;
  spotifyImportStatus: SpotifyImportStatus;
}): {
  blockingReason: OnboardingBlockingReason;
  canProceedToDashboard: boolean;
  phase: OnboardingReadinessPhase;
} {
  if (!hasSpotifySelection) {
    return {
      phase: 'connecting',
      canProceedToDashboard: false,
      blockingReason: 'missing_spotify_selection',
    };
  }

  if (spotifyImportStatus === 'failed') {
    return {
      phase: 'failed',
      canProceedToDashboard: false,
      blockingReason: 'spotify_import_failed',
    };
  }

  if (releaseCount > 0) {
    return {
      phase: 'ready',
      canProceedToDashboard: true,
      blockingReason: null,
    };
  }

  if (
    spotifyImportStatus === 'importing' ||
    spotifyImportStatus === 'unknown'
  ) {
    return {
      phase: 'importing',
      canProceedToDashboard: false,
      blockingReason: 'spotify_import_in_progress',
    };
  }

  if (hasPendingDiscoveryJob) {
    return {
      phase: 'discovering',
      canProceedToDashboard: false,
      blockingReason: 'discovery_in_progress',
    };
  }

  if (releaseCount <= 0) {
    return {
      phase: 'waiting_for_first_release',
      canProceedToDashboard: false,
      blockingReason: 'awaiting_first_release',
    };
  }

  return {
    phase: 'ready',
    canProceedToDashboard: true,
    blockingReason: null,
  };
}
