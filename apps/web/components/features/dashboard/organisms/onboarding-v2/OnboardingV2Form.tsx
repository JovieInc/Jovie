'use client';

// @coverage-via apps/web/tests/components/dashboard/organisms/onboarding-v2-performance.test.tsx

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { useHandleValidation } from '@/features/dashboard/organisms/onboarding-v2/shared/useHandleValidation';
import {
  extractSignupClaimArtistSelection,
  useOnboardingSubmit,
} from '@/features/dashboard/organisms/onboarding-v2/shared/useOnboardingSubmit';
import { useArtistSearchQuery } from '@/lib/queries';
import { OnboardingSidebar } from './OnboardingV2Panels';
import { OnboardingV2StepContent } from './OnboardingV2Steps';
import {
  type DiscoverySnapshot,
  type LateArrival,
  normalizeResumeStep,
  normalizeSelectedArtist,
  type OnboardingV2FormProps,
  type SelectedArtist,
  type StepId,
} from './onboardingV2Model';
import type { OnboardingV2StepContext } from './onboardingV2StepContext';
import { useOnboardingV2Artist } from './useOnboardingV2Artist';
import { useOnboardingV2Discovery } from './useOnboardingV2Discovery';
import { useOnboardingV2Profile } from './useOnboardingV2Profile';
import { useOnboardingV2Url } from './useOnboardingV2Url';

const SIDEBAR_STEPS: ReadonlyArray<Readonly<{ id: StepId; label: string }>> = [
  { id: 'handle', label: 'Handle' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'upgrade', label: 'Plan' },
  // eslint-disable-next-line @jovie/canonical-ui-label-casing -- DSP is an industry-standard initialism.
  { id: 'dsp', label: 'DSPs' },
  { id: 'social', label: 'Social' },
  { id: 'releases', label: 'Releases' },
  { id: 'profile-ready', label: 'Finish' },
];

export function OnboardingV2Form({
  assumeInitialHandleAvailable = false,
  existingAvatarUrl = null,
  existingBio = null,
  existingGenres = null,
  initialDisplayName = '',
  initialHandle = '',
  initialProfileId = null,
  initialResumeStep = null,
  isHydrated,
  isReservedHandle = false,
  shouldAutoSubmitHandle = false,
  userEmail = null,
  userId,
  designV1 = false,
}: Readonly<OnboardingV2FormProps>) {
  const router = useRouter();

  const normalizedInitialHandle = initialHandle.trim().toLowerCase();
  const initialStep =
    initialProfileId !== null && initialProfileId !== undefined
      ? normalizeResumeStep(initialResumeStep)
      : null;

  const [profileHandle, setProfileHandle] = useState(normalizedInitialHandle);
  const [profileId, setProfileId] = useState<string | null>(initialProfileId);
  const [currentStep, setCurrentStep] = useState<StepId>(
    initialStep ?? (initialProfileId ? 'spotify' : 'handle')
  );
  const [selectedArtist, setSelectedArtist] = useState<SelectedArtist | null>(
    null
  );
  const [discoverySnapshot, setDiscoverySnapshot] =
    useState<DiscoverySnapshot | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(
    null
  );
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);
  const [isArtistConnectPending, setIsArtistConnectPending] = useState(false);
  const [lateArrivals, setLateArrivals] = useState<LateArrival[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [anythingElse, setAnythingElse] = useState('');
  const handleInputRef = useRef<HTMLInputElement | null>(null);
  const selectedArtistRef = useRef<SelectedArtist | null>(selectedArtist);
  const currentStepRef = useRef<StepId>(currentStep);
  const discoverySnapshotRef = useRef<DiscoverySnapshot | null>(null);
  const predictedAutoConnectSelectionRef = useRef<SelectedArtist | null>(
    normalizeSelectedArtist(extractSignupClaimArtistSelection())
  );

  const { handleValidation, setHandleValidation, handle, validateHandle } =
    useHandleValidation({
      assumeInitialHandleAvailable:
        assumeInitialHandleAvailable || Boolean(initialProfileId),
      fullName: initialDisplayName,
      normalizedInitialHandle,
    });

  const {
    results: artistResults,
    search,
    state: artistSearchState,
    clear: clearArtistSearch,
  } = useArtistSearchQuery();

  useEffect(() => {
    selectedArtistRef.current = selectedArtist;
  }, [selectedArtist]);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    if (currentStep === 'handle') {
      handleInputRef.current?.focus();
    }
  }, [currentStep]);

  const handleStepCtaDisabledReason = useMemo(() => {
    if (!isHydrated) return 'Preparing your handle step...';
    if (!profileHandle) return 'Enter a handle to continue';
    if (!handleValidation.clientValid) {
      return handleValidation.error || 'Handle is invalid';
    }
    if (handleValidation.checking) return 'Checking availability...';
    if (!handleValidation.available) {
      return handleValidation.error || 'Handle is taken';
    }
    return null;
  }, [handleValidation, isHydrated, profileHandle]);

  useEffect(() => {
    if (!profileHandle) {
      setHandleValidation({
        available: false,
        checking: false,
        clientValid: false,
        error: null,
        suggestions: [],
      });
      return;
    }

    validateHandle(profileHandle);
  }, [profileHandle, setHandleValidation, validateHandle]);

  const goToNextHandleStep = useCallback(() => {
    const predictedSelection = predictedAutoConnectSelectionRef.current;

    if (predictedSelection) {
      setSelectedArtist(previous => previous ?? predictedSelection);
      setCurrentStep('artist-confirm');
      return;
    }

    setCurrentStep('spotify');
  }, []);

  const onboardingStartedAtRef = useRef(Date.now());

  const {
    autoSubmitClaimed,
    handleSubmit,
    isConnecting,
    isEnriching,
    isPendingSubmit,
    state,
  } = useOnboardingSubmit({
    fullName: initialDisplayName,
    goToNextStep: goToNextHandleStep,
    handle,
    handleInput: profileHandle,
    handleValidation,
    isHydrated,
    isReservedHandle,
    onAutoConnectStarted: selection => {
      setSelectedArtist(normalizeSelectedArtist(selection));
      setCurrentStep('artist-confirm');
    },
    onAutoConnectFailed: message => {
      setDiscoveryError(message);
      setSelectedArtist(
        discoverySnapshotRef.current?.selectedSpotifyProfile ?? null
      );
      // Stay on artist-confirm so the user sees the error in context
      // instead of being bounced back to "Are you on Spotify?"
      if (
        currentStepRef.current === 'spotify' ||
        currentStepRef.current === 'artist-confirm'
      ) {
        setCurrentStep('artist-confirm');
      }
    },
    onCompleted: result => {
      setProfileId(result.profileId);
    },
    // eslint-disable-next-line react-hooks/refs -- This stable mount timestamp configures the hook and is never rendered.
    onboardingStartedAtMs: onboardingStartedAtRef.current,
    setProfileReadyHandle: setProfileHandle,
    shouldAutoSubmitHandle,
    userEmail,
    userId,
  });

  const {
    handleAcceptSocial,
    handleConfirmDsp,
    handleDismissSocial,
    handleRejectDsp,
    refreshDiscovery,
  } = useOnboardingV2Discovery({
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
  });

  useOnboardingV2Url(currentStep);

  const { advanceFromStep, connectArtist, handleArtistInput } =
    useOnboardingV2Artist({
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
    });

  const {
    didCopyInstagramBioLink,
    didOpenInstagram,
    handleCopyInstagramBioLink,
    handleOpenDashboard,
    handleOpenInstagram,
    publicProfileUrl,
  } = useOnboardingV2Profile({
    anythingElse,
    currentStep,
    discoverySnapshot,
    existingAvatarUrl,
    existingBio,
    existingGenres,
    initialDisplayName,
    normalizedInitialHandle,
    profileHandle,
    profileId,
    selectedArtist,
  });

  const handleGoBack = useCallback(() => {
    if (currentStep === 'spotify') {
      setCurrentStep('handle');
      return;
    }

    if (currentStep === 'artist-confirm') {
      setCurrentStep('spotify');
      return;
    }

    if (currentStep === 'upgrade') {
      setCurrentStep('artist-confirm');
    }
  }, [currentStep]);

  const stepContext: OnboardingV2StepContext = {
    advanceFromStep,
    anythingElse,
    artistResults,
    connectArtist,
    currentStep,
    didCopyInstagramBioLink,
    didOpenInstagram,
    discoveryError,
    discoverySnapshot,
    handleAcceptSocial,
    handleArtistInput,
    handleConfirmDsp,
    handleCopyInstagramBioLink,
    handleDismissSocial,
    handleInputRef,
    handleOpenDashboard,
    handleOpenInstagram,
    handleRejectDsp,
    handleStepCtaDisabledReason,
    handleValidation,
    isArtistConnectPending,
    isArtistSearchLoading: artistSearchState === 'loading',
    isDiscoveryLoading,
    isHydrated,
    isReservedHandle,
    lateArrivals,
    navigateTo: href => router.push(href),
    profileHandle,
    publicProfileUrl,
    refreshDiscovery,
    searchInput,
    setAnythingElse,
    setCurrentStep,
    setDiscoveryError,
    setProfileHandle,
    submit: {
      autoSubmitClaimed,
      handleSubmit,
      isConnecting,
      isEnriching,
      isPendingSubmit,
      state,
    },
    verificationNotice,
  };

  return (
    <OnboardingExperienceShell
      mode='standalone'
      stableStageHeight={currentStep === 'handle' ? 'tall' : 'default'}
      sidebar={
        <nav aria-label='Onboarding Steps'>
          <OnboardingSidebar
            steps={SIDEBAR_STEPS}
            currentStep={currentStep}
            onBack={
              currentStep === 'spotify' ||
              currentStep === 'artist-confirm' ||
              currentStep === 'upgrade'
                ? handleGoBack
                : undefined
            }
          />
        </nav>
      }
      sidebarTitle='Jovie Setup'
      stageVariant='flat'
      visualVariant={designV1 ? 'v1' : 'default'}
      data-testid='onboarding-experience-shell'
    >
      <OnboardingV2StepContent ctx={stepContext} />
    </OnboardingExperienceShell>
  );
}
