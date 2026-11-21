import {
  Button,
  CompositeField,
  HostDrawnInput,
  HostDrawnTextarea,
  Spinner,
} from '@jovie/ui';
import { ArrowRight, Music2 } from 'lucide-react';
import Image from 'next/image';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { InfoBox } from '@/components/molecules/InfoBox';
import { APP_ROUTES } from '@/constants/routes';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding';
import { presentUnmanagedListing } from '@/lib/profile/artist-status-presentation';
import type { SpotifyArtistResult } from '@/lib/queries';
import { OnboardingV2DiscoveryStep } from './OnboardingV2DiscoverySteps';
import { FlatPanel, StepFrame } from './OnboardingV2Panels';
import {
  canProceedToDashboard,
  getBlockingReason,
  isReadinessPending,
  type SelectedArtist,
} from './onboardingV2Model';
import type { OnboardingV2StepContext } from './onboardingV2StepContext';

interface OnboardingV2SpotifySearchFieldProps {
  readonly isLoading: boolean;
  readonly onInput: (value: string) => void;
  readonly onSelectArtist: (artist: SelectedArtist) => void;
  readonly results: SpotifyArtistResult[];
  readonly value: string;
}

function SearchResults({
  onSelectArtist,
  results,
}: Readonly<{
  onSelectArtist: (artist: SelectedArtist) => void;
  results: SpotifyArtistResult[];
}>) {
  if (results.length === 0) return null;

  return (
    <ContentSurfaceCard className='absolute top-full right-0 left-0 z-10 mt-2'>
      <ul className='max-h-80 overflow-y-auto p-1'>
        {results.map(artist => {
          const followerLabel = artist.followers
            ? `${artist.followers.toLocaleString()} followers`
            : 'Spotify';

          return (
            <li key={artist.id}>
              <Button
                type='button'
                variant='ghost'
                onClick={() => {
                  onSelectArtist({
                    id: artist.id,
                    imageUrl: artist.imageUrl ?? null,
                    name: artist.name,
                    url: artist.url,
                  });
                }}
                className='w-full justify-start'
              >
                {artist.imageUrl ? (
                  <Image
                    src={artist.imageUrl}
                    alt=''
                    width={40}
                    height={40}
                    className='mr-3 h-10 w-10 rounded-full object-cover'
                    unoptimized
                  />
                ) : (
                  <div className='mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-0 text-tertiary-token'>
                    <Music2 className='h-4 w-4' />
                  </div>
                )}

                <div className='mr-3 min-w-0 flex-1 text-left'>
                  <p className='truncate text-sm font-semibold text-primary-token'>
                    {artist.name}
                  </p>
                  <p className='text-xs tabular-nums text-secondary-token'>
                    {followerLabel}
                  </p>
                </div>

                {artist.isClaimed ? (
                  <span
                    className='shrink-0 text-2xs text-tertiary-token'
                    data-testid='listing-badge'
                  >
                    {presentUnmanagedListing().label}
                  </span>
                ) : (
                  <ArrowRight className='h-4 w-4 shrink-0 text-tertiary-token' />
                )}
              </Button>
            </li>
          );
        })}

        <li className='flex items-center justify-between border-t border-subtle px-3 py-2'>
          <span className='text-xs text-tertiary-token'>Need help?</span>
          <a
            href='mailto:support@jov.ie'
            className='text-xs text-secondary-token transition-colors hover:text-primary-token'
          >
            Contact support
          </a>
        </li>
      </ul>
    </ContentSurfaceCard>
  );
}

export function OnboardingV2SpotifySearchField({
  isLoading,
  onInput,
  onSelectArtist,
  results,
  value,
}: Readonly<OnboardingV2SpotifySearchFieldProps>) {
  return (
    <div className='relative'>
      <CompositeField surface='field' shape='md' size='md' className='w-full'>
        <Music2 className='h-4 w-4 shrink-0 text-tertiary-token' />
        <HostDrawnInput
          aria-label='Search By Artist Name Or Paste A Spotify Link'
          autoCapitalize='none'
          autoComplete='off'
          autoCorrect='off'
          className='min-w-0 flex-1'
          onChange={event => onInput(event.target.value)}
          placeholder='Search by artist name or paste a Spotify link'
          spellCheck={false}
          type='text'
          value={value}
        />
        {isLoading ? <Spinner size='sm' /> : null}
      </CompositeField>
      <SearchResults onSelectArtist={onSelectArtist} results={results} />
    </div>
  );
}

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
              <Spinner size='sm' />
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

export function OnboardingV2ProfileReadyStep({
  ctx,
}: Readonly<{ ctx: OnboardingV2StepContext }>) {
  const {
    anythingElse,
    didCopyInstagramBioLink,
    didOpenInstagram,
    discoverySnapshot,
    handleCopyInstagramBioLink,
    handleOpenDashboard,
    handleOpenInstagram,
    publicProfileUrl,
    setAnythingElse,
  } = ctx;

  return (
    <StepFrame
      title='Your Link Is Live'
      prompt='Put your Jovie link where fans already look. We will count activation when the first Instagram visitor lands on it.'
      actions={
        <>
          <Button onClick={handleCopyInstagramBioLink}>
            Copy Instagram Bio Link
          </Button>
          <Button onClick={handleOpenInstagram} variant='secondary'>
            Open Instagram
          </Button>
          <Button
            disabled={!canProceedToDashboard(discoverySnapshot)}
            onClick={handleOpenDashboard}
            variant='ghost'
          >
            Open Dashboard
            <ArrowRight className='ml-1 h-4 w-4' />
          </Button>
        </>
      }
    >
      <FlatPanel>
        <div className='space-y-4'>
          <div>
            <p className='text-2xs font-semibold text-tertiary-token'>
              Your public link
            </p>
            <p className='mt-1 text-base font-semibold text-primary-token'>
              {publicProfileUrl ?? 'Your Jovie link will appear here'}
            </p>
            <p className='mt-2 text-sm leading-6 text-secondary-token'>
              We copy a tagged Instagram bio link so your first visit gets
              attributed even when referrers are weak.
            </p>
          </div>
          <ol className='space-y-3'>
            <li className='flex items-start gap-3'>
              <span className='system-b-onboarding-step-number'>1</span>
              <div className='min-w-0'>
                <p className='text-sm font-semibold text-primary-token'>
                  Copy your Instagram bio link
                </p>
                <p className='text-sm leading-6 text-secondary-token'>
                  {didCopyInstagramBioLink
                    ? 'Copied. Paste this version so Instagram traffic stays attributable.'
                    : 'Use the primary action above to copy the tagged version.'}
                </p>
              </div>
            </li>
            <li className='flex items-start gap-3'>
              <span className='system-b-onboarding-step-number'>2</span>
              <div className='min-w-0'>
                <p className='text-sm font-semibold text-primary-token'>
                  Open Instagram
                </p>
                <p className='text-sm leading-6 text-secondary-token'>
                  {didOpenInstagram
                    ? 'Instagram is open. Head to Edit Profile.'
                    : 'Open your profile settings and go to Edit Profile.'}
                </p>
              </div>
            </li>
            <li className='flex items-start gap-3'>
              <span className='system-b-onboarding-step-number'>3</span>
              <div className='min-w-0'>
                <p className='text-sm font-semibold text-primary-token'>
                  Paste it into your bio
                </p>
                <p className='text-sm leading-6 text-secondary-token'>
                  Put the copied link in the website field. Activation happens
                  on the first Instagram-sourced visit.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </FlatPanel>

      <FlatPanel className='border-b-0 pb-0'>
        <label
          className='text-sm font-semibold text-primary-token'
          htmlFor='onboarding-anything-else'
        >
          Anything else I should know?
        </label>
        <div className='system-b-onboarding-context-textarea mt-3'>
          <HostDrawnTextarea
            id='onboarding-anything-else'
            className='w-full'
            onChange={event => setAnythingElse(event.target.value)}
            placeholder='Optional context for your first Jovie chat…'
            rows={5}
            value={anythingElse}
          />
        </div>
      </FlatPanel>
    </StepFrame>
  );
}

export function OnboardingV2StepContent({
  ctx,
}: Readonly<{ ctx: OnboardingV2StepContext }>) {
  switch (ctx.currentStep) {
    case 'handle':
    case 'spotify':
    case 'artist-confirm':
    case 'upgrade':
      return <OnboardingV2EarlyStep ctx={ctx} />;
    case 'dsp':
    case 'social':
    case 'releases':
    case 'late-arrivals':
      return <OnboardingV2DiscoveryStep ctx={ctx} />;
    case 'profile-ready':
      return <OnboardingV2ProfileReadyStep ctx={ctx} />;
    default:
      return null;
  }
}
