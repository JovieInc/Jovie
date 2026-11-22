import type { MutableRefObject } from 'react';
import type { useOnboardingSubmit } from '@/features/dashboard/organisms/onboarding-v2/shared/useOnboardingSubmit';
import type { SpotifyArtistResult } from '@/lib/queries';
import type {
  DiscoverySnapshot,
  DiscoverySocialItem,
  LateArrival,
  SelectedArtist,
  StepId,
} from './onboardingV2Model';
import type { HandleValidationState } from './shared/types';

type SubmitApi = ReturnType<typeof useOnboardingSubmit>;

/** Everything the onboarding step views read from the form controller. */
export interface OnboardingV2StepContext {
  readonly currentStep: StepId;
  readonly setCurrentStep: (step: StepId) => void;
  readonly navigateTo: (href: string) => void;
  readonly profileHandle: string;
  readonly setProfileHandle: (handle: string) => void;
  readonly handleValidation: HandleValidationState;
  readonly handleInputRef: MutableRefObject<HTMLInputElement | null>;
  readonly handleStepCtaDisabledReason: string | null;
  readonly isHydrated: boolean;
  readonly isReservedHandle: boolean;
  readonly submit: Pick<
    SubmitApi,
    | 'autoSubmitClaimed'
    | 'handleSubmit'
    | 'isConnecting'
    | 'isEnriching'
    | 'isPendingSubmit'
    | 'state'
  >;
  readonly discoveryError: string | null;
  readonly setDiscoveryError: (message: string | null) => void;
  readonly discoverySnapshot: DiscoverySnapshot | null;
  readonly isDiscoveryLoading: boolean;
  readonly lateArrivals: readonly LateArrival[];
  readonly verificationNotice: string | null;
  readonly searchInput: string;
  readonly artistResults: SpotifyArtistResult[];
  readonly isArtistSearchLoading: boolean;
  readonly isArtistConnectPending: boolean;
  readonly handleArtistInput: (value: string) => void;
  readonly connectArtist: (artist: SelectedArtist) => void;
  readonly refreshDiscovery: () => Promise<void>;
  readonly advanceFromStep: () => void;
  readonly handleConfirmDsp: (matchId: string) => Promise<void>;
  readonly handleRejectDsp: (matchId: string) => Promise<void>;
  readonly handleAcceptSocial: (item: DiscoverySocialItem) => Promise<void>;
  readonly handleDismissSocial: (item: DiscoverySocialItem) => Promise<void>;
  readonly publicProfileUrl: string | null;
  readonly didCopyInstagramBioLink: boolean;
  readonly didOpenInstagram: boolean;
  readonly anythingElse: string;
  readonly setAnythingElse: (value: string) => void;
  readonly handleCopyInstagramBioLink: () => Promise<void>;
  readonly handleOpenInstagram: () => void;
  readonly handleOpenDashboard: () => void;
}
