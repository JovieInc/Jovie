import { Button, Spinner as LoadingSpinner } from '@jovie/ui';
import { ArrowRight } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { InfoBox } from '@/components/molecules/InfoBox';
import { APP_ROUTES } from '@/constants/routes';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding';
import { StepFrame } from './OnboardingV2Panels';
import { OnboardingV2SpotifySearchField } from './OnboardingV2SpotifySearchField';
import { getBlockingReason, isReadinessPending } from './onboardingV2Model';
import type { OnboardingV2StepContext } from './onboardingV2StepContext';

export function OnboardingV2EarlyStep({
  ctx,
}: Readonly<{ ctx: OnboardingV2StepContext }>) {
  const {
    advanceFromStep,
    artistResults,
    connectArtist,
    currentStep,
    discoveryError,
    discoverySnapshot,
    handleArtistInput,
    handleInputRef,
    handleStepCtaDisabledReason,
    handleValidation,
    isArtistConnectPending,
    isArtistSearchLoading,
    isDiscoveryLoading,
    isHydrated,
    isReservedHandle,
    navigateTo,
    profileHandle,
    searchInput,
    setCurrentStep,
    setDiscoveryError,
    setProfileHandle,
    verificationNotice,
  } = ctx;
  const {
    autoSubmitClaimed,
    handleSubmit,
    isConnecting,
    isEnriching,
    isPendingSubmit,
    state,
  } = ctx.submit;

  switch (currentStep) {
    case 'handle':
      return (
        <OnboardingHandleStep
          autoSubmitClaimed={autoSubmitClaimed}
          ctaDisabledReason={handleStepCtaDisabledReason}
          handleInput={profileHandle}
          handleValidation={handleValidation}
          inputRef={handleInputRef}
          isHydrated={isHydrated}
          isPendingSubmit={isPendingSubmit}
          isReservedHandle={isReservedHandle}
          isSubmitting={state.isSubmitting}
          isTransitioning={false}
          onHandleChange={setProfileHandle}
          onSubmit={handleSubmit}
          stateError={state.error}
          title='Claim your link'
          prompt='This is the only link you need to share your music. Make it yours.'
        />
      );

    case 'spotify':
      return (
        <StepFrame title='Are you on Spotify?'>
          {discoveryError ? (
            <InfoBox presentation='inline' variant='error'>
              {discoveryError}
            </InfoBox>
          ) : null}

          <OnboardingV2SpotifySearchField
            isLoading={isArtistSearchLoading || isArtistConnectPending}
            onInput={handleArtistInput}
            onSelectArtist={connectArtist}
            results={artistResults}
            value={searchInput}
          />
        </StepFrame>
      );

    case 'artist-confirm': {
      const hasError =
        discoveryError ||
        getBlockingReason(discoverySnapshot) === 'spotify_import_failed';
      const isImporting =
        isArtistConnectPending ||
        isConnecting ||
        isEnriching ||
        isDiscoveryLoading;
      const isVerificationPending = Boolean(verificationNotice) && !hasError;
      const artistConfirmTitle = hasError
        ? 'Import ran into an issue'
        : isVerificationPending
          ? 'Verification in progress'
          : 'Spotify connected';
      const artistConfirmPrompt = hasError
        ? 'You can try connecting again or skip ahead.'
        : isVerificationPending
          ? (verificationNotice ?? '')
          : "We'll import your discography in the background. You can keep going.";
      const chooseArtistLabel = hasError
        ? 'Try again'
        : 'Choose a different artist';

      return (
        <StepFrame
          title={artistConfirmTitle}
          prompt={artistConfirmPrompt}
          actions={
            <>
              <Button
                onClick={() => {
                  setDiscoveryError(null);
                  setCurrentStep('spotify');
                }}
                disabled={isImporting}
                variant='secondary'
              >
                {chooseArtistLabel}
              </Button>
              <Button
                onClick={() => setCurrentStep('upgrade')}
                disabled={isImporting}
              >
                Continue
                <ArrowRight className='ml-1 h-4 w-4' />
              </Button>
            </>
          }
        >
          {isImporting && !hasError ? (
            <div className='flex items-center gap-2 text-sm text-secondary-token'>
              <LoadingSpinner size='sm' />
              <span>Importing…</span>
            </div>
          ) : null}
        </StepFrame>
      );
    }

    case 'upgrade':
      return (
        <StepFrame
          title='Want the full profile from day one?'
          prompt='Your import is ready. Continue with the free plan, or unlock the paid plan before you land in the dashboard.'
          actions={
            <>
              <Button
                disabled={isReadinessPending(discoverySnapshot)}
                onClick={advanceFromStep}
                variant='secondary'
              >
                Continue Free
              </Button>
              <Button
                onClick={() => {
                  navigateTo(
                    `${APP_ROUTES.ONBOARDING_CHECKOUT}?source=organic&returnTo=${encodeURIComponent(
                      `${APP_ROUTES.ONBOARDING}?resume=dsp`
                    )}`
                  );
                }}
              >
                Upgrade Now
              </Button>
            </>
          }
        >
          <ContentSurfaceCard>
            <div className='p-5'>
              <p className='text-sm font-semibold text-primary-token'>
                Your import is ready.
              </p>
              <p className='mt-2 text-sm leading-6 text-secondary-token'>
                Upgrade unlocks album art, pitch tools, and advanced AI. After
                checkout, you&apos;ll return here to finish setup.
              </p>
            </div>
          </ContentSurfaceCard>
        </StepFrame>
      );

    default:
      return null;
  }
}
