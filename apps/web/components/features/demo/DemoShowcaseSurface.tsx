'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import {
  primaryProviderKeys,
  providerConfig,
} from '@/app/app/(shell)/dashboard/releases/config';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { OnboardingDspStep } from '@/features/dashboard/organisms/onboarding/OnboardingDspStep';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding/OnboardingHandleStep';
import { OnboardingProfileReviewStep } from '@/features/dashboard/organisms/onboarding/OnboardingProfileReviewStep';
import { ReleasesEmptyState } from '@/features/dashboard/organisms/release-provider-matrix/ReleasesEmptyState';
import { ReleasesExperience } from '@/features/dashboard/organisms/release-provider-matrix/ReleasesExperience';
import { DashboardAnalyticsDemo } from '@/features/home/demo/DashboardAnalyticsDemo';
import { DashboardEarningsDemo } from '@/features/home/demo/DashboardEarningsDemo';
import { DashboardLinksDemo } from '@/features/home/demo/DashboardLinksDemo';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import { DemoAuthShell } from './DemoAuthShell';
import { DemoClientProviders } from './DemoClientProviders';
import { DemoReleaseLandingSurface } from './DemoReleaseLandingSurface';
import { DemoReleasePresaveSurface } from './DemoReleasePresaveSurface';
import { DemoReleasesExperience } from './DemoReleasesExperience';
import { DemoReleaseTasksSurface } from './DemoReleaseTasksSurface';
import { DemoSettingsPanel } from './DemoSettingsPanel';
import {
  DEMO_RELEASE_SIDEBAR_FIXTURES,
  DEMO_RELEASE_VIEW_MODELS,
} from './mock-release-data';
import type { DemoShowcaseSurfaceId } from './showcase-surfaces';

type DemoRenderableSurfaceId = Exclude<DemoShowcaseSurfaceId, 'public-profile'>;

const RELEASE_SHOWCASE_STATES = [
  'populated',
  'disconnected',
  'connected-empty',
  'importing',
  'failed',
  'partial',
] as const;

type ReleaseShowcaseState = (typeof RELEASE_SHOWCASE_STATES)[number];

interface DemoShowcaseSurfaceProps {
  readonly surface: DemoRenderableSurfaceId;
}

const HANDLE_VALIDATION_MOCK = {
  available: true,
  checking: false,
  error: null,
  clientValid: true,
  suggestions: ['calvindemo', 'calvinharrisdemo'],
};

const PROFILE_REVIEW_DATA: EnrichedProfileData = {
  name: INTERNAL_DJ_DEMO_PERSONA.profile.displayName,
  imageUrl: INTERNAL_DJ_DEMO_PERSONA.profile.avatarSrc,
  bio: INTERNAL_DJ_DEMO_PERSONA.profile.bio,
  genres: [...INTERNAL_DJ_DEMO_PERSONA.profile.genres],
  followers: INTERNAL_DJ_DEMO_PERSONA.profile.spotifyFollowers ?? 184_000,
};

const DEMO_RELEASE_EXPERIENCE_ADAPTER = {
  mode: 'demo',
  entitlements: {
    isPro: true,
    canCreateManualReleases: true,
    canEditSmartLinks: true,
    canAccessFutureReleases: true,
    smartLinksLimit: null,
  },
  onCopy: async (path: string) => path,
  onCreateRelease: () => {},
  onSync: () => {},
  onRefreshRelease: () => {},
  onArtworkUpload: async () => '',
  onArtworkRevert: async () => '',
  onAddDspLink: async () => {},
  onRescanIsrc: () => {},
  onSaveLyrics: async () => {},
  onSaveMetadata: async () => {},
  onSavePrimaryIsrc: async () => {},
  onSaveTargetPlaylists: async () => {},
  onFormatLyrics: async (_releaseId: string, lyrics: string) => [lyrics],
  onCanvasStatusUpdate: async () => {},
  onToggleArtworkDownloads: async () => {},
  sidebarDataByReleaseId: DEMO_RELEASE_SIDEBAR_FIXTURES,
} as const;

function DemoShowcasePanel({
  testId,
  children,
}: Readonly<{
  testId: string;
  children: React.ReactNode;
}>) {
  return (
    <DemoAuthShell>
      <AppShellContentPanel
        maxWidth='wide'
        frame='none'
        contentPadding='none'
        scroll='page'
        data-testid={testId}
      >
        <section className='overflow-hidden px-4 py-4 sm:px-5 sm:py-5'>
          {children}
        </section>
      </AppShellContentPanel>
    </DemoAuthShell>
  );
}

function DemoOnboardingShowcase({
  children,
  stableStageHeight = 'default',
  testId,
}: Readonly<{
  children: React.ReactNode;
  stableStageHeight?: 'default' | 'tall';
  testId: string;
}>) {
  return (
    <div data-testid={testId}>
      <DemoClientProviders>
        <OnboardingExperienceShell
          mode='standalone'
          stableStageHeight={stableStageHeight}
          data-testid={`${testId}-shell`}
        >
          {children}
        </OnboardingExperienceShell>
      </DemoClientProviders>
    </div>
  );
}

function isReleaseShowcaseState(
  value: string | null
): value is ReleaseShowcaseState {
  return RELEASE_SHOWCASE_STATES.includes(value as ReleaseShowcaseState);
}

function DemoReleasesShowcaseState({
  state,
}: Readonly<{ state: ReleaseShowcaseState }>) {
  if (state === 'populated') {
    return <DemoReleasesExperience />;
  }

  if (state === 'failed' || state === 'partial') {
    return (
      <DemoShowcasePanel testId={`demo-showcase-releases-${state}`}>
        <ReleasesEmptyState
          onConnectSpotify={() => {}}
          enrichmentStatus={state}
          onRetryEnrichment={() => {}}
        />
      </DemoShowcasePanel>
    );
  }

  return (
    <DemoAuthShell>
      <ReleasesExperience
        releases={
          state === 'disconnected' ? [] : DEMO_RELEASE_VIEW_MODELS.slice(0, 0)
        }
        providerConfig={providerConfig}
        primaryProviders={primaryProviderKeys}
        spotifyConnected={state !== 'disconnected'}
        spotifyArtistName={INTERNAL_DJ_DEMO_PERSONA.profile.displayName}
        appleMusicConnected={state !== 'disconnected'}
        appleMusicArtistName={INTERNAL_DJ_DEMO_PERSONA.profile.displayName}
        allowArtworkDownloads
        initialImporting={state === 'importing'}
        initialTotalCount={state === 'importing' ? 12 : 0}
        experienceAdapter={DEMO_RELEASE_EXPERIENCE_ADAPTER}
      />
    </DemoAuthShell>
  );
}

export function DemoShowcaseSurface({
  surface,
}: Readonly<DemoShowcaseSurfaceProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [handleInput, setHandleInput] = useState(
    INTERNAL_DJ_DEMO_PERSONA.profile.handle
  );
  const noop = useCallback(() => {}, []);
  const searchParams = useSearchParams();

  switch (surface) {
    case 'analytics':
      return (
        <DemoShowcasePanel testId='demo-showcase-analytics'>
          <DashboardAnalyticsDemo />
        </DemoShowcasePanel>
      );
    case 'earnings':
      return (
        <DemoShowcasePanel testId='demo-showcase-earnings'>
          <DashboardEarningsDemo />
        </DemoShowcasePanel>
      );
    case 'links':
      return (
        <DemoShowcasePanel testId='demo-showcase-links'>
          <DashboardLinksDemo />
        </DemoShowcasePanel>
      );
    case 'releases': {
      const requestedState = searchParams.get('state');
      const state = isReleaseShowcaseState(requestedState)
        ? requestedState
        : 'populated';

      return <DemoReleasesShowcaseState state={state} />;
    }
    case 'settings':
      return (
        <DemoShowcasePanel testId='demo-showcase-settings'>
          <DemoSettingsPanel />
        </DemoShowcasePanel>
      );
    case 'release-landing':
      return <DemoReleaseLandingSurface />;
    case 'release-presave':
      return <DemoReleasePresaveSurface />;
    case 'release-tasks':
      return <DemoReleaseTasksSurface />;
    case 'onboarding-handle':
      return (
        <DemoOnboardingShowcase
          stableStageHeight='tall'
          testId='demo-showcase-onboarding-handle'
        >
          <OnboardingHandleStep
            title='Choose your handle'
            prompt='This is how fans will find and remember you.'
            handleInput={handleInput}
            isHydrated
            handleValidation={HANDLE_VALIDATION_MOCK}
            stateError={null}
            isSubmitting={false}
            isTransitioning={false}
            ctaDisabledReason={null}
            inputRef={inputRef}
            onHandleChange={setHandleInput}
            onSubmit={noop}
            onSuggestionClick={setHandleInput}
          />
        </DemoOnboardingShowcase>
      );
    case 'onboarding-dsp':
      return (
        <DemoOnboardingShowcase testId='demo-showcase-onboarding-dsp'>
          <OnboardingDspStep
            title='Connect your music'
            prompt='Import your releases from Spotify so fans can find your music.'
            onConnected={noop}
            onSkip={noop}
            isTransitioning={false}
          />
        </DemoOnboardingShowcase>
      );
    case 'onboarding-profile-review':
      return (
        <DemoOnboardingShowcase testId='demo-showcase-onboarding-profile-review'>
          <OnboardingProfileReviewStep
            title='Your profile'
            prompt='Review your profile before going live.'
            enrichedProfile={PROFILE_REVIEW_DATA}
            handle='soravale'
            onGoToDashboard={noop}
            isEnriching={false}
            existingAvatarUrl={PROFILE_REVIEW_DATA.imageUrl}
            existingBio={PROFILE_REVIEW_DATA.bio}
            existingGenres={PROFILE_REVIEW_DATA.genres}
            isStepResume
          />
        </DemoOnboardingShowcase>
      );
    default: {
      const exhaustiveCheck: never = surface;
      return exhaustiveCheck;
    }
  }
}
