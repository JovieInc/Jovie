'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  primaryProviderKeys,
  providerConfig,
} from '@/app/app/(shell)/dashboard/releases/config';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { DashboardPay } from '@/features/dashboard/dashboard-pay';
import { InsightsPanelView } from '@/features/dashboard/insights/InsightsPanel';
import { GroupedLinksManager } from '@/features/dashboard/organisms/GroupedLinksManager';
import { convertDbLinkToDetected } from '@/features/dashboard/organisms/links/utils/link-transformers';
import { OnboardingDspStep } from '@/features/dashboard/organisms/onboarding/OnboardingDspStep';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding/OnboardingHandleStep';
import { OnboardingProfileReviewStep } from '@/features/dashboard/organisms/onboarding/OnboardingProfileReviewStep';
import { ReleasesEmptyState } from '@/features/dashboard/organisms/release-provider-matrix/ReleasesEmptyState';
import { ReleasesExperience } from '@/features/dashboard/organisms/release-provider-matrix/ReleasesExperience';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import type { InsightCategory } from '@/types/insights';
import { DemoAuthShell } from './DemoAuthShell';
import { DemoClientProviders } from './DemoClientProviders';
import { DemoReleaseLandingSurface } from './DemoReleaseLandingSurface';
import { DemoReleasePresaveSurface } from './DemoReleasePresaveSurface';
import { DemoReleasesExperience } from './DemoReleasesExperience';
import { DemoReleaseTasksSurface } from './DemoReleaseTasksSurface';
import { DemoReleaseTrackedLinksSurface } from './DemoReleaseTrackedLinksSurface';
import { DemoSettingsPanel } from './DemoSettingsPanel';
import { DemoTimWhiteProfileSurface } from './DemoTimWhiteProfileSurface';
import {
  DEMO_EARNINGS_RESPONSE,
  DEMO_ENRICHED_PROFILE,
  DEMO_HANDLE_VALIDATION,
  DEMO_INSIGHTS,
  DEMO_PROFILE_SOCIAL_LINKS,
} from './demo-surface-fixtures';
import { DEMO_DASHBOARD_DATA } from './mock-dashboard-data';
import {
  DEMO_RELEASE_SIDEBAR_FIXTURES,
  DEMO_RELEASE_VIEW_MODELS,
} from './mock-release-data';
import { SettingsDemoHarness } from './SettingsDemoHarness';
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
  const [selectedInsightCategory, setSelectedInsightCategory] = useState<
    InsightCategory | 'all'
  >('all');
  const noop = useCallback(() => {}, []);
  const searchParams = useSearchParams();
  const demoInsights = useMemo(
    () =>
      selectedInsightCategory === 'all'
        ? DEMO_INSIGHTS
        : DEMO_INSIGHTS.filter(
            insight => insight.category === selectedInsightCategory
          ),
    [selectedInsightCategory]
  );
  const demoDetectedLinks = useMemo(
    () => DEMO_PROFILE_SOCIAL_LINKS.map(convertDbLinkToDetected),
    []
  );

  switch (surface) {
    case 'analytics':
      return (
        <DemoAuthShell>
          <InsightsPanelView
            insights={demoInsights}
            isLoading={false}
            error={null}
            selectedCategory={selectedInsightCategory}
            onCategoryChange={setSelectedInsightCategory}
            onGenerate={noop}
            isGenerating={false}
            testId='demo-showcase-analytics'
          />
        </DemoAuthShell>
      );
    case 'earnings':
      return (
        <SettingsDemoHarness
          dashboardData={DEMO_DASHBOARD_DATA}
          earningsData={DEMO_EARNINGS_RESPONSE}
        >
          <div data-testid='demo-showcase-earnings'>
            <DashboardPay />
          </div>
        </SettingsDemoHarness>
      );
    case 'links':
      return (
        <SettingsDemoHarness shell='page' testId='demo-showcase-links'>
          <div className='flex min-h-0 flex-1'>
            <GroupedLinksManager
              initialLinks={demoDetectedLinks}
              creatorName={INTERNAL_DJ_DEMO_PERSONA.profile.displayName}
              isMusicProfile
              suggestionsEnabled={false}
              sidebarOpen={false}
              className='flex-1'
            />
          </div>
        </SettingsDemoHarness>
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
    case 'release-tracked-links':
      return <DemoReleaseTrackedLinksSurface />;
    case 'release-presave':
      return <DemoReleasePresaveSurface />;
    case 'release-tasks':
      return <DemoReleaseTasksSurface />;
    case 'tim-white-profile':
      return <DemoTimWhiteProfileSurface />;
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
            handleValidation={DEMO_HANDLE_VALIDATION}
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
            enrichedProfile={DEMO_ENRICHED_PROFILE}
            handle='soravale'
            onGoToDashboard={noop}
            isEnriching={false}
            existingAvatarUrl={DEMO_ENRICHED_PROFILE.imageUrl}
            existingBio={DEMO_ENRICHED_PROFILE.bio}
            existingGenres={DEMO_ENRICHED_PROFILE.genres}
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
