'use client';

import { useCallback, useRef, useState } from 'react';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { OnboardingDspStep } from '@/features/dashboard/organisms/onboarding/OnboardingDspStep';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding/OnboardingHandleStep';
import { OnboardingProfileReviewStep } from '@/features/dashboard/organisms/onboarding/OnboardingProfileReviewStep';
import { DashboardAnalyticsDemo } from '@/features/home/demo/DashboardAnalyticsDemo';
import { DashboardEarningsDemo } from '@/features/home/demo/DashboardEarningsDemo';
import { DashboardLinksDemo } from '@/features/home/demo/DashboardLinksDemo';
import { DemoAuthShell } from './DemoAuthShell';
import { DemoClientProviders } from './DemoClientProviders';
import { DemoSettingsPanel } from './DemoSettingsPanel';
import type { DemoShowcaseSurfaceId } from './showcase-surfaces';

type DemoRenderableSurfaceId = Exclude<DemoShowcaseSurfaceId, 'public-profile'>;

interface DemoShowcaseSurfaceProps {
  readonly surface: DemoRenderableSurfaceId;
}

const HANDLE_VALIDATION_MOCK = {
  available: true,
  checking: false,
  error: null,
  clientValid: true,
  suggestions: ['soravale', 'soravalemusic'],
};

const PROFILE_REVIEW_DATA: EnrichedProfileData = {
  name: 'Sora Vale',
  imageUrl:
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=640&q=80',
  bio: 'Indie electronic artist from Portland creating cinematic synth pop for late-night drives.',
  genres: ['Indie Electronic', 'Synthwave', 'Ambient Pop'],
  followers: 184_000,
};

function DemoShowcasePanel({
  title,
  testId,
  children,
}: Readonly<{
  title: string;
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
        <section className='space-y-4'>
          <div className='overflow-hidden rounded-xl border border-(--linear-app-frame-seam) bg-surface-1'>
            <ContentSectionHeader title={title} className='min-h-0 py-3' />
            <div className='px-4 py-4 sm:px-5 sm:py-5'>{children}</div>
          </div>
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

export function DemoShowcaseSurface({
  surface,
}: Readonly<DemoShowcaseSurfaceProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [handleInput, setHandleInput] = useState('soravale');
  const noop = useCallback(() => {}, []);

  switch (surface) {
    case 'analytics':
      return (
        <DemoShowcasePanel
          title='Analytics Overview'
          testId='demo-showcase-analytics'
        >
          <DashboardAnalyticsDemo />
        </DemoShowcasePanel>
      );
    case 'earnings':
      return (
        <DemoShowcasePanel
          title='Earnings Overview'
          testId='demo-showcase-earnings'
        >
          <DashboardEarningsDemo />
        </DemoShowcasePanel>
      );
    case 'links':
      return (
        <DemoShowcasePanel title='Links Manager' testId='demo-showcase-links'>
          <DashboardLinksDemo />
        </DemoShowcasePanel>
      );
    case 'settings':
      return (
        <DemoShowcasePanel
          title='Artist Profile Settings'
          testId='demo-showcase-settings'
        >
          <DemoSettingsPanel />
        </DemoShowcasePanel>
      );
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
