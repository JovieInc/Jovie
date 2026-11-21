import { Button } from '@jovie/ui';
import { ArrowRight, AudioLines, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { InfoBox } from '@/components/molecules/InfoBox';
import { EmptyState, FlatPanel, StepFrame } from './OnboardingV2Panels';
import {
  getDspStatusLabel,
  getReadinessMessage,
  isReadinessPending,
} from './onboardingV2Model';
import type { OnboardingV2StepContext } from './onboardingV2StepContext';

export function OnboardingV2DiscoveryStep({
  ctx,
}: Readonly<{ ctx: OnboardingV2StepContext }>) {
  const {
    advanceFromStep,
    currentStep,
    discoveryError,
    discoverySnapshot,
    handleAcceptSocial,
    handleConfirmDsp,
    handleDismissSocial,
    handleRejectDsp,
    lateArrivals,
    refreshDiscovery,
  } = ctx;

  switch (currentStep) {
    case 'dsp':
      return (
        <StepFrame
          title='Review DSP matches'
          prompt='Jovie is checking for your presence on other music platforms.'
          actions={
            <Button onClick={() => refreshDiscovery()} variant='secondary'>
              <RefreshCw className='mr-1 h-4 w-4' />
              Refresh
            </Button>
          }
        >
          {discoveryError ? (
            <InfoBox presentation='inline' variant='error'>
              {discoveryError}
            </InfoBox>
          ) : null}

          {discoverySnapshot?.dspItems.length ? (
            discoverySnapshot.dspItems.map(item => (
              <FlatPanel key={item.id}>
                <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                  <div className='min-w-0'>
                    <p className='text-2xs font-semibold text-tertiary-token'>
                      {item.providerLabel}
                    </p>
                    <p className='truncate text-base font-semibold text-primary-token'>
                      {item.externalArtistName || 'Suggested artist'}
                    </p>
                    <p className='text-sm text-secondary-token'>
                      {getDspStatusLabel(item.status)}
                    </p>
                  </div>

                  <div className='flex flex-wrap gap-2'>
                    {item.externalArtistUrl ? (
                      <Button asChild size='sm' variant='secondary'>
                        <Link
                          href={item.externalArtistUrl}
                          target='_blank'
                          rel='noreferrer'
                        >
                          Open
                        </Link>
                      </Button>
                    ) : null}

                    {item.status === 'suggested' ? (
                      <>
                        <Button
                          onClick={() => {
                            handleRejectDsp(item.id);
                          }}
                          size='sm'
                          variant='secondary'
                        >
                          Reject
                        </Button>
                        <Button
                          onClick={() => {
                            handleConfirmDsp(item.id);
                          }}
                          size='sm'
                        >
                          Accept
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </FlatPanel>
            ))
          ) : (
            <EmptyState
              title={
                discoverySnapshot?.hasPendingDiscoveryJob
                  ? 'Still discovering DSPs'
                  : 'No additional DSP matches yet'
              }
              body='We did not find additional DSP matches in this onboarding pass.'
            />
          )}
        </StepFrame>
      );

    case 'social':
      return (
        <StepFrame
          title='Review social links'
          prompt='We found social profiles and candidate links that may belong on your page.'
          actions={
            <Button onClick={() => refreshDiscovery()} variant='secondary'>
              <RefreshCw className='mr-1 h-4 w-4' />
              Refresh
            </Button>
          }
        >
          {discoveryError ? (
            <InfoBox presentation='inline' variant='error'>
              {discoveryError}
            </InfoBox>
          ) : null}

          {(discoverySnapshot?.socialItems.length ?? 0) > 0 ? (
            discoverySnapshot?.socialItems.map(item => {
              const isPending =
                item.kind === 'suggestion'
                  ? item.state === 'pending'
                  : item.state === 'suggested';

              return (
                <FlatPanel key={`${item.kind}:${item.id}`}>
                  <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='min-w-0'>
                      <p className='text-2xs font-semibold text-tertiary-token'>
                        {item.platformLabel}
                      </p>
                      <p className='truncate text-base font-semibold text-primary-token'>
                        {item.username || item.url}
                      </p>
                      <p className='text-sm text-secondary-token'>
                        {isPending
                          ? 'Needs your review'
                          : 'Already active on your profile'}
                      </p>
                    </div>

                    <div className='flex flex-wrap gap-2'>
                      <Button asChild size='sm' variant='secondary'>
                        <Link href={item.url} target='_blank' rel='noreferrer'>
                          Open
                        </Link>
                      </Button>
                      {isPending ? (
                        <>
                          <Button
                            onClick={() => {
                              handleDismissSocial(item);
                            }}
                            size='sm'
                            variant='secondary'
                          >
                            Dismiss
                          </Button>
                          <Button
                            onClick={() => {
                              handleAcceptSocial(item);
                            }}
                            size='sm'
                          >
                            Add
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </FlatPanel>
              );
            })
          ) : (
            <EmptyState
              title='No social suggestions yet'
              body='We did not find any social suggestions in this onboarding pass.'
            />
          )}
        </StepFrame>
      );

    case 'releases':
      return (
        <StepFrame
          title='Your release preview'
          prompt='This is what Jovie pulled in from your catalog.'
          actions={
            <>
              <Button onClick={() => refreshDiscovery()} variant='secondary'>
                <RefreshCw className='mr-1 h-4 w-4' />
                Refresh
              </Button>
              <Button
                disabled={isReadinessPending(discoverySnapshot)}
                onClick={advanceFromStep}
              >
                Continue
                <ArrowRight className='ml-1 h-4 w-4' />
              </Button>
            </>
          }
        >
          {discoveryError ? (
            <InfoBox presentation='inline' variant='error'>
              {discoveryError}
            </InfoBox>
          ) : null}
          {discoverySnapshot?.releases.length ? (
            discoverySnapshot.releases.map(release => (
              <FlatPanel key={release.id}>
                <div className='flex items-center gap-4'>
                  {release.artworkUrl ? (
                    <Image
                      src={release.artworkUrl}
                      alt=''
                      width={64}
                      height={64}
                      className='h-16 w-16 rounded-2xl object-cover'
                      unoptimized
                    />
                  ) : (
                    <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-0 text-tertiary-token'>
                      <AudioLines className='h-5 w-5' />
                    </div>
                  )}
                  <div className='min-w-0'>
                    <p className='truncate text-base font-semibold text-primary-token'>
                      {release.title}
                    </p>
                    <p className='text-sm text-secondary-token'>
                      {release.releaseDate
                        ? new Date(release.releaseDate).toLocaleDateString()
                        : 'Release date pending'}
                    </p>
                  </div>
                </div>
              </FlatPanel>
            ))
          ) : (
            <EmptyState
              title='Still importing releases'
              body={
                getReadinessMessage(discoverySnapshot) ??
                'This is taking longer than usual. Refresh to check again.'
              }
            />
          )}
        </StepFrame>
      );

    case 'late-arrivals':
      return (
        <StepFrame
          title='A few more things showed up'
          prompt='Discovery kept running while you moved through onboarding.'
          actions={
            <Button onClick={advanceFromStep}>
              Finish Setup
              <ArrowRight className='ml-1 h-4 w-4' />
            </Button>
          }
        >
          {lateArrivals.map(item => (
            <FlatPanel key={item.id}>
              <p className='text-2xs font-semibold text-tertiary-token'>
                {item.subtitle}
              </p>
              <p className='mt-1 text-base font-semibold text-primary-token'>
                {item.title}
              </p>
            </FlatPanel>
          ))}
        </StepFrame>
      );

    default:
      return null;
  }
}
