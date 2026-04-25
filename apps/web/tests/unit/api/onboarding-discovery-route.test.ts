import { describe, expect, it } from 'vitest';
import {
  buildReadinessState,
  parseSpotifyImportStatus,
} from '@/lib/onboarding/discovery-readiness';

describe('onboarding discovery readiness', () => {
  it('treats importing Spotify state as blocking', () => {
    expect(
      buildReadinessState({
        hasPendingDiscoveryJob: false,
        hasSpotifySelection: true,
        releaseCount: 0,
        spotifyImportStatus: 'importing',
      })
    ).toEqual({
      blockingReason: 'spotify_import_in_progress',
      canProceedToDashboard: false,
      phase: 'importing',
    });
  });

  it('returns ready once the first release is visible even while import is still running', () => {
    expect(
      buildReadinessState({
        hasPendingDiscoveryJob: false,
        hasSpotifySelection: true,
        releaseCount: 5,
        spotifyImportStatus: 'importing',
      })
    ).toEqual({
      blockingReason: null,
      canProceedToDashboard: true,
      phase: 'ready',
    });
  });

  it('treats pending discovery jobs as non-blocking once releases are visible', () => {
    expect(
      buildReadinessState({
        hasPendingDiscoveryJob: true,
        hasSpotifySelection: true,
        releaseCount: 5,
        spotifyImportStatus: 'complete',
      })
    ).toEqual({
      blockingReason: null,
      canProceedToDashboard: true,
      phase: 'ready',
    });
  });

  it('returns ready once import is complete and discovery is idle', () => {
    expect(
      buildReadinessState({
        hasPendingDiscoveryJob: false,
        hasSpotifySelection: true,
        releaseCount: 5,
        spotifyImportStatus: 'complete',
      })
    ).toEqual({
      blockingReason: null,
      canProceedToDashboard: true,
      phase: 'ready',
    });
  });

  it('blocks creators with no visible releases even after import completes', () => {
    expect(
      buildReadinessState({
        hasPendingDiscoveryJob: false,
        hasSpotifySelection: true,
        releaseCount: 0,
        spotifyImportStatus: 'complete',
      })
    ).toEqual({
      blockingReason: 'awaiting_first_release',
      canProceedToDashboard: false,
      phase: 'waiting_for_first_release',
    });
  });

  it('treats failed Spotify import as terminal failure', () => {
    expect(
      buildReadinessState({
        hasPendingDiscoveryJob: false,
        hasSpotifySelection: true,
        releaseCount: 0,
        spotifyImportStatus: 'failed',
      })
    ).toEqual({
      blockingReason: 'spotify_import_failed',
      canProceedToDashboard: false,
      phase: 'failed',
    });
  });

  it('maps missing Spotify selection to idle import status', () => {
    expect(parseSpotifyImportStatus(null, false)).toBe('idle');
  });

  it('maps unknown populated selection status to unknown', () => {
    expect(parseSpotifyImportStatus('queued', true)).toBe('unknown');
  });
});
