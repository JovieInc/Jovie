'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
} from 'react';
import { connectOnboardingSpotifyArtist } from '@/app/onboarding/actions/connect-spotify';
import { enrichProfileFromDsp } from '@/app/onboarding/actions/enrich-profile';
import {
  canProceedToDashboard,
  DISCOVERY_AUTO_ADVANCE_MS,
  type DiscoverySnapshot,
  extractSpotifyArtistId,
  isReadinessPending,
  type SelectedArtist,
  type StepId,
} from './onboardingV2Model';

interface UseOnboardingV2ArtistParams {
  readonly clearArtistSearch: () => void;
  readonly currentStep: StepId;
  readonly discoverySnapshot: DiscoverySnapshot | null;
  readonly isArtistConnectPending: boolean;
  readonly isConnecting: boolean;
  readonly profileId: string | null;
  readonly refreshDiscovery: () => Promise<void>;
  readonly search: (value: string) => void;
  readonly setCurrentStep: Dispatch<SetStateAction<StepId>>;
  readonly setDiscoveryError: Dispatch<SetStateAction<string | null>>;
  readonly setIsArtistConnectPending: Dispatch<SetStateAction<boolean>>;
  readonly setSearchInput: Dispatch<SetStateAction<string>>;
  readonly setSelectedArtist: Dispatch<SetStateAction<SelectedArtist | null>>;
  readonly setVerificationNotice: Dispatch<SetStateAction<string | null>>;
}

/** Spotify artist connection plus the step-to-step advance rules. */
export function useOnboardingV2Artist({
  clearArtistSearch,
  currentStep,
  discoverySnapshot,
  isArtistConnectPending,
  isConnecting,
  profileId,
  refreshDiscovery,
  search,
  setCurrentStep,
  setDiscoveryError,
  setIsArtistConnectPending,
  setSearchInput,
  setSelectedArtist,
  setVerificationNotice,
}: UseOnboardingV2ArtistParams) {
  const connectArtist = useCallback(
    async (artist: SelectedArtist) => {
      if (!profileId) return;

      clearArtistSearch();
      setSearchInput('');
      setSelectedArtist(artist);
      setCurrentStep('artist-confirm');
      setIsArtistConnectPending(true);
      setDiscoveryError(null);
      setVerificationNotice(null);

      try {
        const connectResult = await connectOnboardingSpotifyArtist({
          artistName: artist.name,
          includeTracks: true,
          profileId,
          spotifyArtistId: artist.id,
          spotifyArtistUrl: artist.url,
        });

        if (connectResult.verificationPending) {
          // High-reach artist: not linked until ownership is verified. The
          // user keeps going (plan + profile work); no enrichment runs.
          setIsArtistConnectPending(false);
          setVerificationNotice(connectResult.message);
          return;
        }

        if (!connectResult.success) {
          throw new Error(
            connectResult.message || 'Failed to connect your Spotify artist.'
          );
        }
      } catch (error) {
        setIsArtistConnectPending(false);
        setDiscoveryError(
          error instanceof Error
            ? error.message
            : 'Failed to connect your Spotify artist.'
        );
        // Stay on artist-confirm so the user sees the error in context
        return;
      }

      setIsArtistConnectPending(false);
      void enrichProfileFromDsp(artist.id, artist.url).catch(() => {
        // Best-effort: if enrichment fails, the profile keeps its current name.
      });
      await refreshDiscovery().catch(() => {
        // refreshDiscovery is responsible for setting user-facing error state
      });
    },
    [
      clearArtistSearch,
      profileId,
      refreshDiscovery,
      setCurrentStep,
      setDiscoveryError,
      setIsArtistConnectPending,
      setSearchInput,
      setSelectedArtist,
      setVerificationNotice,
    ]
  );

  const handleArtistInput = useCallback(
    (value: string) => {
      setSearchInput(value);
      setDiscoveryError(null);

      const directArtistId = extractSpotifyArtistId(value);
      if (directArtistId) {
        connectArtist({
          id: directArtistId,
          imageUrl: null,
          name: '',
          url: `https://open.spotify.com/artist/${directArtistId}`,
        });
        return;
      }

      // Detect URLs and show helpful feedback
      const trimmed = value.trim();
      if (/^https?:\/\/.+/i.test(trimmed)) {
        if (trimmed.includes('spotify.com')) {
          // Spotify URL but not an artist page (track, album, playlist, etc.)
          setDiscoveryError(
            'That looks like a Spotify link, but not an artist page. Paste your Spotify artist URL.'
          );
        } else {
          setDiscoveryError(
            'Only Spotify artist URLs are supported. Paste a link like open.spotify.com/artist/...'
          );
        }
        return;
      }

      search(value);
    },
    [connectArtist, search, setDiscoveryError, setSearchInput]
  );

  const advanceFromStep = useCallback(() => {
    setCurrentStep(previous => {
      switch (previous) {
        case 'artist-confirm':
          return canProceedToDashboard(discoverySnapshot)
            ? 'upgrade'
            : 'artist-confirm';
        case 'upgrade':
          return canProceedToDashboard(discoverySnapshot) ? 'dsp' : 'upgrade';
        case 'dsp':
          if (isReadinessPending(discoverySnapshot)) {
            return 'dsp';
          }
          return 'social';
        case 'social':
          if (isReadinessPending(discoverySnapshot)) {
            return 'social';
          }
          return 'releases';
        case 'releases':
          if (
            isReadinessPending(discoverySnapshot) ||
            (discoverySnapshot?.counts.releaseCount ?? 0) <= 0
          ) {
            return 'releases';
          }
          return 'profile-ready';
        case 'late-arrivals':
          return canProceedToDashboard(discoverySnapshot)
            ? 'profile-ready'
            : 'releases';
        default:
          return previous;
      }
    });
  }, [discoverySnapshot, setCurrentStep]);

  useEffect(() => {
    if (
      currentStep === 'artist-confirm' &&
      !isArtistConnectPending &&
      !isConnecting &&
      canProceedToDashboard(discoverySnapshot)
    ) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (currentStep === 'dsp' && canProceedToDashboard(discoverySnapshot)) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (currentStep === 'social' && canProceedToDashboard(discoverySnapshot)) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (
      currentStep === 'releases' &&
      canProceedToDashboard(discoverySnapshot) &&
      (discoverySnapshot?.counts.releaseCount ?? 0) > 0
    ) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    return undefined;
  }, [
    advanceFromStep,
    currentStep,
    discoverySnapshot,
    isArtistConnectPending,
    isConnecting,
  ]);

  return { advanceFromStep, connectArtist, handleArtistInput };
}
