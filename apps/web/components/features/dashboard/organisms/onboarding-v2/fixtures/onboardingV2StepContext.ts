import type { DiscoverySnapshot } from '../onboardingV2Model';
import type { OnboardingV2StepContext } from '../onboardingV2StepContext';

const noop = () => {};
const asyncNoop = async () => {};

export const SPARSE_SNAPSHOT: DiscoverySnapshot = {
  counts: { activeSocialCount: 0, dspCount: 1, releaseCount: 1 },
  dspItems: [
    {
      confidenceScore: 0.9,
      externalArtistId: 'artist-1',
      externalArtistImageUrl: null,
      externalArtistName: 'Avery Stone',
      externalArtistUrl: 'https://open.spotify.com/artist/artist-1',
      id: 'dsp-1',
      providerId: 'spotify',
      providerLabel: 'Spotify',
      status: 'suggested',
    },
  ],
  hasPendingDiscoveryJob: false,
  importState: {
    activeSocialCount: 0,
    confirmedDspCount: 0,
    hasImportedReleases: true,
    hasSpotifySelection: true,
    recordingCount: 1,
    releaseCount: 1,
    spotifyImportStatus: 'complete',
  },
  profile: {
    activeSinceYear: null,
    appleMusicConnected: false,
    avatarUrl: null,
    bio: null,
    displayName: 'Avery Stone',
    genres: null,
    hometown: null,
    id: 'profile-1',
    location: null,
    onboardingCompletedAt: null,
    username: 'avery',
  },
  readiness: {
    blockingReason: null,
    canProceedToDashboard: true,
    phase: 'ready',
  },
  releases: [
    {
      artworkUrl: null,
      id: 'release-1',
      releaseDate: '2024-01-01',
      spotifyPopularity: 50,
      title: 'First Light',
    },
  ],
  selectedSpotifyProfile: null,
  socialItems: [],
};

/** A step context with inert handlers, for stories and tests. */
export function createStepContext(
  overrides: Partial<OnboardingV2StepContext> = {}
): OnboardingV2StepContext {
  return {
    advanceFromStep: noop,
    anythingElse: '',
    artistResults: [],
    connectArtist: noop,
    currentStep: 'handle',
    didCopyInstagramBioLink: false,
    didOpenInstagram: false,
    discoveryError: null,
    discoverySnapshot: null,
    handleAcceptSocial: asyncNoop,
    handleArtistInput: noop,
    handleConfirmDsp: asyncNoop,
    handleCopyInstagramBioLink: asyncNoop,
    handleDismissSocial: asyncNoop,
    handleInputRef: { current: null },
    handleOpenDashboard: noop,
    handleOpenInstagram: noop,
    handleRejectDsp: asyncNoop,
    handleStepCtaDisabledReason: null,
    handleValidation: {
      available: true,
      checking: false,
      clientValid: true,
      error: null,
      suggestions: [],
    },
    isArtistConnectPending: false,
    isArtistSearchLoading: false,
    isDiscoveryLoading: false,
    isHydrated: true,
    isReservedHandle: false,
    lateArrivals: [],
    navigateTo: noop,
    profileHandle: 'avery',
    publicProfileUrl: 'https://jov.ie/avery',
    refreshDiscovery: asyncNoop,
    searchInput: '',
    setAnythingElse: noop,
    setCurrentStep: noop,
    setDiscoveryError: noop,
    setProfileHandle: noop,
    submit: {
      autoSubmitClaimed: false,
      handleSubmit: asyncNoop,
      isConnecting: false,
      isEnriching: false,
      isPendingSubmit: false,
      state: {
        error: null,
        isSubmitting: false,
        progress: 0,
        retryCount: 0,
        step: 'validating',
      },
    },
    verificationNotice: null,
    ...overrides,
  };
}
