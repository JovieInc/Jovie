'use client';

import { useCallback, useRef, useState } from 'react';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { AuthLayout } from '@/features/auth';
import { OnboardingDspStep } from '@/features/dashboard/organisms/onboarding/OnboardingDspStep';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding/OnboardingHandleStep';
import { OnboardingProfileReviewStep } from '@/features/dashboard/organisms/onboarding/OnboardingProfileReviewStep';
import { DemoAuthShell } from '@/features/demo/DemoAuthShell';
import { DemoClientProviders } from '@/features/demo/DemoClientProviders';
import { DemoSettingsPanel } from '@/features/demo/DemoSettingsPanel';
import type { DemoShowcaseSurfaceId } from '@/features/demo/showcase-surfaces';
import { DashboardAnalyticsDemo } from '@/features/home/demo/DashboardAnalyticsDemo';
import { DashboardEarningsDemo } from '@/features/home/demo/DashboardEarningsDemo';
import { DashboardLinksDemo } from '@/features/home/demo/DashboardLinksDemo';

type DemoRenderableSurfaceId = Exclude<DemoShowcaseSurfaceId, 'public-profile'>;

interface DemoShowcaseSurfaceClientProps {
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
  imageUrl: '/images/avatars/nova-lane.jpg',
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
      <section className='px-6 py-6' data-testid={testId}>
        <div className='mb-4'>
          <p className='text-[12px] uppercase tracking-[0.14em] text-tertiary-token'>
            Demo Surface
          </p>
          <h1 className='text-2xl font-[620] tracking-[-0.02em] text-primary-token'>
            {title}
          </h1>
        </div>
        {children}
      </section>
    </DemoAuthShell>
  );
}

export function DemoShowcaseSurfaceClient({
  surface,
}: Readonly<DemoShowcaseSurfaceClientProps>) {
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
        <div data-testid='demo-showcase-onboarding-handle'>
          <DemoClientProviders>
            <AuthLayout
              formTitle='Choose your handle'
              showFormTitle={false}
              showFooterPrompt={false}
              showSkipLink={false}
              showLogo={false}
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
            </AuthLayout>
          </DemoClientProviders>
        </div>
      );
    case 'onboarding-dsp':
      return (
        <div data-testid='demo-showcase-onboarding-dsp'>
          <DemoClientProviders>
            <AuthLayout
              formTitle='Connect your music'
              showFormTitle={false}
              showFooterPrompt={false}
              showSkipLink={false}
              showLogo={false}
            >
              <OnboardingDspStep
                title='Connect your music'
                prompt='Import your releases from Spotify so fans can find your music.'
                onConnected={noop}
                onSkip={noop}
                isTransitioning={false}
              />
            </AuthLayout>
          </DemoClientProviders>
        </div>
      );
    case 'onboarding-profile-review':
      return (
        <div data-testid='demo-showcase-onboarding-profile-review'>
          <DemoClientProviders>
            <AuthLayout
              formTitle='Your profile'
              showFormTitle={false}
              showFooterPrompt={false}
              showSkipLink={false}
              showLogo={false}
            >
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
            </AuthLayout>
          </DemoClientProviders>
        </div>
      );
    default: {
      const exhaustiveCheck: never = surface;
      return exhaustiveCheck;
    }
  }
}
