'use client';

import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  canProceedToDashboard,
  collectLateArrivals,
  DISCOVERY_POLL_INTERVAL_MS,
  type DiscoverySnapshot,
  type DiscoverySocialItem,
  fetchDiscoverySnapshot,
  getDiscoveryErrorMessage,
  type LateArrival,
  mergeLateArrivals,
  mergeSelectedArtist,
  type SelectedArtist,
  type StepId,
} from './onboardingV2Model';

interface UseOnboardingV2DiscoveryParams {
  readonly currentStep: StepId;
  readonly currentStepRef: MutableRefObject<StepId>;
  readonly discoverySnapshot: DiscoverySnapshot | null;
  readonly discoverySnapshotRef: MutableRefObject<DiscoverySnapshot | null>;
  readonly initialStep: StepId | null;
  readonly profileId: string | null;
  readonly setCurrentStep: Dispatch<SetStateAction<StepId>>;
  readonly setDiscoveryError: Dispatch<SetStateAction<string | null>>;
  readonly setDiscoverySnapshot: Dispatch<
    SetStateAction<DiscoverySnapshot | null>
  >;
  readonly setIsDiscoveryLoading: Dispatch<SetStateAction<boolean>>;
  readonly setLateArrivals: Dispatch<SetStateAction<LateArrival[]>>;
  readonly setSelectedArtist: Dispatch<SetStateAction<SelectedArtist | null>>;
}

/**
 * Owns discovery polling, the resume handshake and the DSP/social review
 * mutations. State stays in the form so the step views read one snapshot.
 */
export function useOnboardingV2Discovery({
  currentStep,
  currentStepRef,
  discoverySnapshot,
  discoverySnapshotRef,
  initialStep,
  profileId,
  setCurrentStep,
  setDiscoveryError,
  setDiscoverySnapshot,
  setIsDiscoveryLoading,
  setLateArrivals,
  setSelectedArtist,
}: UseOnboardingV2DiscoveryParams) {
  const discoveryInFlightRef = useRef(false);
  const discoveryRequestSeqRef = useRef(0);
  const lateArrivalIdsRef = useRef<Set<string>>(new Set());
  const didResolveInitialResumeRef = useRef(false);

  const refreshDiscovery = useCallback(
    async (signal?: AbortSignal) => {
      if (!profileId) return;

      const requestSeq = discoveryRequestSeqRef.current + 1;
      discoveryRequestSeqRef.current = requestSeq;
      discoveryInFlightRef.current = true;
      setIsDiscoveryLoading(true);

      try {
        const nextSnapshot = await fetchDiscoverySnapshot(profileId, signal);
        if (signal?.aborted || requestSeq !== discoveryRequestSeqRef.current) {
          return;
        }

        // Only clear error on successful fetch — don't clear on poll start
        setDiscoveryError(null);
        const previousSnapshot = discoverySnapshotRef.current;
        discoverySnapshotRef.current = nextSnapshot;
        setDiscoverySnapshot(nextSnapshot);
        setSelectedArtist(current =>
          mergeSelectedArtist(current, nextSnapshot.selectedSpotifyProfile)
        );

        if (!previousSnapshot) {
          return;
        }

        const late = collectLateArrivals(
          previousSnapshot,
          nextSnapshot,
          currentStepRef.current
        );

        if (late.length > 0) {
          setLateArrivals(previous => {
            return mergeLateArrivals(previous, late, lateArrivalIdsRef.current);
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        if (requestSeq !== discoveryRequestSeqRef.current) {
          return;
        }

        setDiscoveryError(getDiscoveryErrorMessage(error));
      } finally {
        if (requestSeq === discoveryRequestSeqRef.current) {
          discoveryInFlightRef.current = false;
        }
        if (!signal?.aborted && requestSeq === discoveryRequestSeqRef.current) {
          setIsDiscoveryLoading(false);
        }
      }
    },
    [
      currentStepRef,
      discoverySnapshotRef,
      profileId,
      setDiscoveryError,
      setDiscoverySnapshot,
      setIsDiscoveryLoading,
      setLateArrivals,
      setSelectedArtist,
    ]
  );

  useEffect(() => {
    if (
      !profileId ||
      currentStep !== 'spotify' ||
      initialStep ||
      didResolveInitialResumeRef.current
    ) {
      return;
    }

    const controller = new AbortController();
    refreshDiscovery(controller.signal).catch(() => {
      // refreshDiscovery is responsible for setting user-facing error state
    });

    return () => {
      controller.abort();
    };
  }, [currentStep, initialStep, profileId, refreshDiscovery]);

  useEffect(() => {
    if (!profileId) return;

    const shouldPoll =
      currentStep === 'artist-confirm' ||
      currentStep === 'dsp' ||
      currentStep === 'social' ||
      currentStep === 'releases' ||
      currentStep === 'late-arrivals' ||
      currentStep === 'profile-ready';

    if (!shouldPoll) return;

    const controller = new AbortController();
    refreshDiscovery(controller.signal);

    const intervalId = globalThis.setInterval(() => {
      // Single flight: a newer poll supersedes an older request, so polling
      // over a hung request would discard its timeout error forever.
      if (discoveryInFlightRef.current) return;
      refreshDiscovery(controller.signal);
    }, DISCOVERY_POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      globalThis.clearInterval(intervalId);
    };
  }, [currentStep, profileId, refreshDiscovery]);

  useEffect(() => {
    if (didResolveInitialResumeRef.current) return;
    if (!profileId) {
      setCurrentStep('handle');
      didResolveInitialResumeRef.current = true;
      return;
    }
    if (initialStep) {
      didResolveInitialResumeRef.current = true;
      return;
    }

    if (currentStep !== 'spotify') {
      didResolveInitialResumeRef.current = true;
      return;
    }

    if (!discoverySnapshot) return;

    didResolveInitialResumeRef.current = true;

    if (discoverySnapshot.selectedSpotifyProfile) {
      setCurrentStep('artist-confirm');
      return;
    }

    setCurrentStep('spotify');
  }, [currentStep, discoverySnapshot, initialStep, profileId, setCurrentStep]);

  useEffect(() => {
    if (currentStep !== 'profile-ready') {
      return;
    }

    if (!discoverySnapshot) {
      return;
    }

    if (canProceedToDashboard(discoverySnapshot)) {
      return;
    }

    setCurrentStep('releases');
  }, [currentStep, discoverySnapshot, setCurrentStep]);

  const runDiscoveryMutation = useCallback(
    async ({
      body,
      errorMessage,
      method,
      url,
    }: {
      body: Record<string, unknown>;
      errorMessage: string;
      method: 'PATCH' | 'POST';
      url: string;
    }) => {
      setDiscoveryError(null);

      try {
        const response = await fetch(url, {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
          method,
        });

        if (!response.ok) {
          setDiscoveryError(errorMessage);
          return;
        }

        await refreshDiscovery();
      } catch {
        setDiscoveryError(errorMessage);
      }
    },
    [refreshDiscovery, setDiscoveryError]
  );

  const handleConfirmDsp = useCallback(
    async (matchId: string) => {
      if (!profileId) return;

      await runDiscoveryMutation({
        body: { profileId },
        errorMessage: 'Failed to confirm DSP match.',
        method: 'POST',
        url: `/api/dsp/matches/${matchId}/confirm`,
      });
    },
    [profileId, runDiscoveryMutation]
  );

  const handleRejectDsp = useCallback(
    async (matchId: string) => {
      if (!profileId) return;

      await runDiscoveryMutation({
        body: { profileId },
        errorMessage: 'Failed to reject DSP match.',
        method: 'POST',
        url: `/api/dsp/matches/${matchId}/reject`,
      });
    },
    [profileId, runDiscoveryMutation]
  );

  const handleAcceptSocial = useCallback(
    async (item: DiscoverySocialItem) => {
      if (!profileId) return;

      if (item.kind === 'suggestion') {
        await runDiscoveryMutation({
          body: { profileId },
          errorMessage: 'Failed to add suggested social link.',
          method: 'POST',
          url: `/api/suggestions/social-links/${item.id}/approve`,
        });
      } else {
        await runDiscoveryMutation({
          body: {
            action: 'accept',
            expectedVersion: item.version ?? 1,
            linkId: item.id,
            profileId,
          },
          errorMessage: 'Failed to accept social link.',
          method: 'PATCH',
          url: '/api/dashboard/social-links',
        });
      }
    },
    [profileId, runDiscoveryMutation]
  );

  const handleDismissSocial = useCallback(
    async (item: DiscoverySocialItem) => {
      if (!profileId) return;

      if (item.kind === 'suggestion') {
        await runDiscoveryMutation({
          body: { profileId },
          errorMessage: 'Failed to dismiss suggested social link.',
          method: 'POST',
          url: `/api/suggestions/social-links/${item.id}/reject`,
        });
      } else {
        await runDiscoveryMutation({
          body: {
            action: 'dismiss',
            expectedVersion: item.version ?? 1,
            linkId: item.id,
            profileId,
          },
          errorMessage: 'Failed to dismiss social link.',
          method: 'PATCH',
          url: '/api/dashboard/social-links',
        });
      }
    },
    [profileId, runDiscoveryMutation]
  );

  return {
    handleAcceptSocial,
    handleConfirmDsp,
    handleDismissSocial,
    handleRejectDsp,
    refreshDiscovery,
  };
}
