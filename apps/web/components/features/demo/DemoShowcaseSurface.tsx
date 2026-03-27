'use client';

import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { NuqsProvider } from '@/components/providers/NuqsProvider';
import { AuthLayout } from '@/features/auth';
import { OnboardingDspStep } from '@/features/dashboard/organisms/onboarding/OnboardingDspStep';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding/OnboardingHandleStep';
import { OnboardingProfileReviewStep } from '@/features/dashboard/organisms/onboarding/OnboardingProfileReviewStep';
import { DashboardAnalyticsDemo } from '@/features/home/demo/DashboardAnalyticsDemo';
import { DashboardEarningsDemo } from '@/features/home/demo/DashboardEarningsDemo';
import { DashboardLinksDemo } from '@/features/home/demo/DashboardLinksDemo';
import { ClerkSafeDefaultsProvider } from '@/hooks/useClerkSafe';
import { DemoAuthShell } from './DemoAuthShell';
import { DemoSettingsPanel } from './DemoSettingsPanel';
import type { DemoShowcaseSurfaceId } from './showcase-surfaces';

interface DemoShowcaseSurfaceProps {
  readonly surface: DemoShowcaseSurfaceId;
}

const PROFILE_REVIEW_DATA: EnrichedProfileData = {
  name: 'Sora Vale',
  imageUrl:
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=640&q=80',
  bio: 'Indie electronic artist from Portland creating cinematic synth pop for late-night drives.',
  genres: ['Indie Electronic', 'Synthwave', 'Ambient Pop'],
  followers: 184_000,
};

function DemoOnboardingProviders({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Number.POSITIVE_INFINITY,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ClerkSafeDefaultsProvider>
      <QueryClientProvider client={queryClient}>
        <NuqsProvider>
          <TooltipProvider delayDuration={1200}>{children}</TooltipProvider>
        </NuqsProvider>
      </QueryClientProvider>
    </ClerkSafeDefaultsProvider>
  );
}

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

export function DemoShowcaseSurface({
  surface,
}: Readonly<DemoShowcaseSurfaceProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [handleInput, setHandleInput] = useState('soravale');
  const handleValidation = {
    available: true,
    checking: false,
    error: null,
    clientValid: true,
    suggestions: ['soravale', 'soravalemusic'],
  };
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
          <DemoOnboardingProviders>
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
                handleValidation={handleValidation}
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
          </DemoOnboardingProviders>
        </div>
      );
    case 'onboarding-dsp':
      return (
        <div data-testid='demo-showcase-onboarding-dsp'>
          <DemoOnboardingProviders>
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
          </DemoOnboardingProviders>
        </div>
      );
    case 'onboarding-profile-review':
      return (
        <div data-testid='demo-showcase-onboarding-profile-review'>
          <DemoOnboardingProviders>
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
          </DemoOnboardingProviders>
        </div>
      );
    default:
      return null;
  }
}
