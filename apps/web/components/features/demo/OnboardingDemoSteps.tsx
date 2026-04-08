'use client';

import { Button } from '@jovie/ui';
import { ArrowRight, Check, Disc3, ExternalLink, Music2 } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Avatar } from '@/components/molecules/Avatar';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerLinkSection } from '@/components/molecules/drawer/DrawerLinkSection';
import { EntityHeaderCard } from '@/components/molecules/drawer/EntityHeaderCard';
import { SidebarLinkRow } from '@/components/molecules/drawer/SidebarLinkRow';
import type {
  MockDiscoverySnapshot,
  MockSelectedArtist,
  MockSpotifySearchResult,
} from './mock-onboarding-data';
import {
  DEMO_DISCOVERY_SNAPSHOT,
  DEMO_HANDLE_SUGGESTIONS,
  DEMO_LATE_ARRIVALS,
  DEMO_SELECTED_ARTIST,
  DEMO_SPOTIFY_SEARCH_RESULTS,
} from './mock-onboarding-data';

export type StepId =
  | 'handle'
  | 'spotify'
  | 'artist-confirm'
  | 'upgrade'
  | 'dsp'
  | 'social'
  | 'releases'
  | 'late-arrivals'
  | 'profile-ready';

export const ALL_STEPS: StepId[] = [
  'handle',
  'spotify',
  'artist-confirm',
  'upgrade',
  'dsp',
  'social',
  'releases',
  'late-arrivals',
  'profile-ready',
];

interface StepFrameProps {
  readonly actions?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly prompt?: string;
  readonly title: string;
}

function StepFrame({ actions, children, prompt, title }: StepFrameProps) {
  return (
    <div className='mx-auto flex h-full w-full max-w-[42rem] flex-col justify-center gap-6 py-4 sm:py-6'>
      <div className='space-y-2'>
        <h1 className='text-2xl font-[620] tracking-[-0.04em] text-primary-token sm:text-3xl'>
          {title}
        </h1>
        {prompt ? (
          <p className='max-w-xl text-sm leading-6 text-secondary-token'>
            {prompt}
          </p>
        ) : null}
      </div>

      <div className='space-y-4'>{children}</div>

      {actions ? (
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function SpotifySearchResults({
  results,
}: Readonly<{ results: MockSpotifySearchResult[] }>) {
  return (
    <ContentSurfaceCard
      as='ul'
      className='mt-2 max-h-[280px] overflow-y-auto p-1'
    >
      {results.map(artist => (
        <li key={artist.id}>
          <button
            type='button'
            className='flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-1'
          >
            <Avatar
              src={artist.imageUrl}
              alt={artist.name}
              name={artist.name}
              size='sm'
              rounded='full'
            />
            <div className='min-w-0 flex-1'>
              <p className='truncate text-[13px] font-[560] text-primary-token'>
                {artist.name}
              </p>
              <p className='text-[11px] text-secondary-token'>
                {artist.followers.toLocaleString()} followers
              </p>
            </div>
            <ArrowRight className='h-4 w-4 shrink-0 text-tertiary-token' />
          </button>
        </li>
      ))}
    </ContentSurfaceCard>
  );
}

function getDspStatusLabel(
  status: 'suggested' | 'confirmed' | 'rejected' | 'auto_confirmed'
): string {
  switch (status) {
    case 'suggested':
      return 'Needs your review';
    case 'confirmed':
      return 'Confirmed';
    case 'auto_confirmed':
      return 'Auto-confirmed (high confidence)';
    case 'rejected':
      return 'Rejected';
  }
}

function DspReviewStep({
  snapshot,
}: Readonly<{ snapshot: MockDiscoverySnapshot }>) {
  const [statuses, setStatuses] = useState<
    Record<string, 'suggested' | 'confirmed' | 'rejected' | 'auto_confirmed'>
  >(() => Object.fromEntries(snapshot.dspItems.map(i => [i.id, i.status])));

  const setStatus = useCallback(
    (id: string, status: 'confirmed' | 'rejected') => {
      setStatuses(prev => ({ ...prev, [id]: status }));
    },
    []
  );

  const confirmed = snapshot.dspItems.filter(
    i => statuses[i.id] === 'confirmed' || statuses[i.id] === 'auto_confirmed'
  );
  const suggested = snapshot.dspItems.filter(
    i => statuses[i.id] === 'suggested'
  );
  const rejected = snapshot.dspItems.filter(i => statuses[i.id] === 'rejected');

  return (
    <StepFrame title='Music platforms'>
      <DrawerLinkSection
        title='Confirmed'
        isEmpty={confirmed.length === 0}
        emptyMessage='No confirmed platforms yet.'
      >
        {confirmed.map(item => (
          <SidebarLinkRow
            key={item.id}
            icon={
              <SocialIcon
                platform={item.providerId}
                className='h-4 w-4'
                aria-hidden
              />
            }
            label={`${item.externalArtistName || 'Artist'} — ${item.providerLabel}`}
            url={item.externalArtistUrl || '#'}
            badge={getDspStatusLabel(statuses[item.id])}
          />
        ))}
      </DrawerLinkSection>

      {suggested.length > 0 ? (
        <DrawerLinkSection title='Needs review' isEmpty={false}>
          {suggested.map(item => (
            <div key={item.id} className='flex items-center gap-1'>
              <div className='min-w-0 flex-1'>
                <SidebarLinkRow
                  icon={
                    <SocialIcon
                      platform={item.providerId}
                      className='h-4 w-4'
                      aria-hidden
                    />
                  }
                  label={`${item.externalArtistName || 'Artist'} — ${item.providerLabel}`}
                  url={item.externalArtistUrl || '#'}
                />
              </div>
              <div className='flex shrink-0 gap-1'>
                <Button
                  size='sm'
                  variant='secondary'
                  onClick={() => setStatus(item.id, 'rejected')}
                >
                  Reject
                </Button>
                <Button
                  size='sm'
                  onClick={() => setStatus(item.id, 'confirmed')}
                >
                  Accept
                </Button>
              </div>
            </div>
          ))}
        </DrawerLinkSection>
      ) : null}

      {rejected.length > 0 ? (
        <DrawerLinkSection title='Rejected' isEmpty={false}>
          {rejected.map(item => (
            <SidebarLinkRow
              key={item.id}
              icon={
                <SocialIcon
                  platform={item.providerId}
                  className='h-4 w-4'
                  aria-hidden
                />
              }
              label={`${item.externalArtistName || 'Artist'} — ${item.providerLabel}`}
              url={item.externalArtistUrl || '#'}
              badge='Rejected'
              isVisible={false}
            />
          ))}
        </DrawerLinkSection>
      ) : null}
    </StepFrame>
  );
}

function SocialReviewStep({
  snapshot,
}: Readonly<{ snapshot: MockDiscoverySnapshot }>) {
  const [states, setStates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      snapshot.socialItems.map(i => [`${i.kind}:${i.id}`, i.state])
    )
  );

  const accept = useCallback((key: string) => {
    setStates(prev => ({ ...prev, [key]: 'active' }));
  }, []);

  const dismiss = useCallback((key: string) => {
    setStates(prev => ({ ...prev, [key]: 'dismissed' }));
  }, []);

  const active = snapshot.socialItems.filter(i => {
    const key = `${i.kind}:${i.id}`;
    const state = states[key];
    return state === 'active';
  });

  const pending = snapshot.socialItems.filter(i => {
    const key = `${i.kind}:${i.id}`;
    const state = states[key];
    return state === 'pending' || state === 'suggested';
  });

  const dismissed = snapshot.socialItems.filter(i => {
    const key = `${i.kind}:${i.id}`;
    return states[key] === 'dismissed';
  });

  return (
    <StepFrame title='Social links'>
      <DrawerLinkSection
        title='Active'
        isEmpty={active.length === 0}
        emptyMessage='No active social links yet.'
      >
        {active.map(item => (
          <SidebarLinkRow
            key={`${item.kind}:${item.id}`}
            icon={
              <SocialIcon
                platform={item.platform}
                className='h-4 w-4'
                aria-hidden
              />
            }
            label={item.platformLabel}
            url={item.url}
            deepLinkPlatform={item.platform}
          />
        ))}
      </DrawerLinkSection>

      {pending.length > 0 ? (
        <DrawerLinkSection title='Suggested' isEmpty={false}>
          {pending.map(item => {
            const key = `${item.kind}:${item.id}`;
            return (
              <div key={key} className='flex items-center gap-1'>
                <div className='min-w-0 flex-1'>
                  <SidebarLinkRow
                    icon={
                      <SocialIcon
                        platform={item.platform}
                        className='h-4 w-4'
                        aria-hidden
                      />
                    }
                    label={item.platformLabel}
                    url={item.url}
                    deepLinkPlatform={item.platform}
                  />
                </div>
                <div className='flex shrink-0 gap-1'>
                  <Button
                    size='sm'
                    variant='secondary'
                    onClick={() => dismiss(key)}
                  >
                    Dismiss
                  </Button>
                  <Button size='sm' onClick={() => accept(key)}>
                    Add
                  </Button>
                </div>
              </div>
            );
          })}
        </DrawerLinkSection>
      ) : null}

      {dismissed.length > 0 ? (
        <DrawerLinkSection title='Dismissed' isEmpty={false}>
          {dismissed.map(item => (
            <SidebarLinkRow
              key={`${item.kind}:${item.id}`}
              icon={
                <SocialIcon
                  platform={item.platform}
                  className='h-4 w-4'
                  aria-hidden
                />
              }
              label={item.platformLabel}
              url={item.url}
              isVisible={false}
              deepLinkPlatform={item.platform}
            />
          ))}
        </DrawerLinkSection>
      ) : null}
    </StepFrame>
  );
}

interface OnboardingDemoStepProps {
  readonly step: StepId;
  readonly snapshot?: MockDiscoverySnapshot;
  readonly selectedArtist?: MockSelectedArtist;
  readonly onFinish?: () => void;
}

export function OnboardingDemoStep({
  step,
  snapshot = DEMO_DISCOVERY_SNAPSHOT,
  selectedArtist = DEMO_SELECTED_ARTIST,
  onFinish,
}: OnboardingDemoStepProps) {
  switch (step) {
    case 'handle':
      return (
        <StepFrame
          title='Choose your handle'
          actions={
            <Button disabled>
              Continue
              <ArrowRight className='ml-1 h-4 w-4' />
            </Button>
          }
        >
          <div className='space-y-3'>
            <div className='flex items-center gap-3 rounded-[22px] border border-subtle bg-surface-1 px-4 py-3'>
              <span className='text-sm text-tertiary-token'>@</span>
              <input
                autoCapitalize='none'
                autoComplete='off'
                autoCorrect='off'
                className='min-w-0 flex-1 bg-transparent text-sm text-primary-token outline-none placeholder:text-tertiary-token'
                defaultValue='tovelo'
                placeholder='yourhandle'
                spellCheck={false}
                type='text'
              />
              <Check className='h-4 w-4 text-success' />
            </div>

            <div className='flex flex-wrap gap-2'>
              {DEMO_HANDLE_SUGGESTIONS.map(handle => (
                <button
                  key={handle}
                  type='button'
                  className='rounded-full border border-subtle px-3 py-1 text-[12px] text-secondary-token transition-colors hover:bg-surface-1'
                >
                  @{handle}
                </button>
              ))}
            </div>
          </div>
        </StepFrame>
      );

    case 'spotify':
      return (
        <StepFrame title='Connect Spotify'>
          <div>
            <div className='flex items-center gap-3 rounded-[22px] border border-subtle bg-surface-1 px-4 py-3'>
              <Music2 className='h-4 w-4 shrink-0 text-tertiary-token' />
              <input
                autoCapitalize='none'
                autoComplete='off'
                autoCorrect='off'
                className='min-w-0 flex-1 bg-transparent text-sm text-primary-token outline-none placeholder:text-tertiary-token'
                defaultValue='Tove Lo'
                placeholder='Search by artist name or paste a Spotify link'
                spellCheck={false}
                type='text'
              />
            </div>
            <SpotifySearchResults results={DEMO_SPOTIFY_SEARCH_RESULTS} />
          </div>
        </StepFrame>
      );

    case 'artist-confirm':
      return (
        <StepFrame
          title='Spotify connected'
          actions={
            <>
              <Button variant='secondary'>Choose a different artist</Button>
              <Button>
                Continue
                <ArrowRight className='ml-1 h-4 w-4' />
              </Button>
            </>
          }
        >
          <EntityHeaderCard
            image={
              <Avatar
                src={selectedArtist.imageUrl}
                alt={selectedArtist.name}
                name={selectedArtist.name}
                size='xl'
                rounded='full'
              />
            }
            title={selectedArtist.name}
            subtitle='Selected artist'
            meta={
              <div className='mt-1 flex items-center gap-2 text-[12px] text-secondary-token'>
                <Check className='h-3.5 w-3.5 text-success' />
                <span>Connected for this profile</span>
              </div>
            }
            badge={
              <Button asChild variant='secondary' size='sm' className='ml-auto'>
                <a href={selectedArtist.url} target='_blank' rel='noreferrer'>
                  View
                  <ExternalLink className='ml-1 h-3.5 w-3.5' />
                </a>
              </Button>
            }
          />
        </StepFrame>
      );

    case 'upgrade':
      return (
        <StepFrame title='Choose your plan'>
          <div className='grid gap-4 sm:grid-cols-2'>
            {/* Free */}
            <div className='flex flex-col gap-4 rounded-xl border border-subtle p-5'>
              <p className='text-[13px] font-[590] text-primary-token'>Free</p>
              <p className='text-2xl font-[620] text-primary-token'>$0</p>
              <ul className='space-y-2 text-[13px] leading-[1.5] text-secondary-token'>
                <li className='flex items-start gap-2'>
                  <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  Unlimited smart links
                </li>
                <li className='flex items-start gap-2'>
                  <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  Auto-sync from Spotify
                </li>
                <li className='flex items-start gap-2'>
                  <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  Public artist profile
                </li>
                <li className='flex items-start gap-2'>
                  <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  Basic analytics (30 days)
                </li>
              </ul>
              <Button variant='secondary' className='mt-auto w-full'>
                Continue free
              </Button>
            </div>

            {/* Pro */}
            <div className='flex flex-col gap-4 rounded-xl border border-subtle bg-surface-1 p-5'>
              <p className='text-[13px] font-[590] text-primary-token'>Pro</p>
              <div className='flex items-baseline gap-1'>
                <p className='text-2xl font-[620] text-primary-token'>$39</p>
                <span className='text-[12px] text-secondary-token'>/month</span>
              </div>
              <ul className='space-y-2 text-[13px] leading-[1.5] text-secondary-token'>
                <li className='flex items-start gap-2'>
                  <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  Everything in Free
                </li>
                <li className='flex items-start gap-2'>
                  <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  Advanced analytics (90 days)
                </li>
                <li className='flex items-start gap-2'>
                  <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  Fan notifications
                </li>
                <li className='flex items-start gap-2'>
                  <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  Contact export
                </li>
                <li className='flex items-start gap-2'>
                  <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  AI assistant (100 msgs/day)
                </li>
              </ul>
              <Button className='mt-auto w-full'>Upgrade to Pro</Button>
            </div>
          </div>
        </StepFrame>
      );

    case 'dsp':
      return <DspReviewStep snapshot={snapshot} />;

    case 'social':
      return <SocialReviewStep snapshot={snapshot} />;

    case 'releases':
      return (
        <StepFrame
          title='Your releases'
          actions={
            <Button>
              Continue
              <ArrowRight className='ml-1 h-4 w-4' />
            </Button>
          }
        >
          <DrawerLinkSection
            title='Catalog'
            isEmpty={snapshot.releases.length === 0}
            emptyMessage='No releases have landed yet.'
          >
            {snapshot.releases.map(release => (
              <SidebarLinkRow
                key={release.id}
                icon={
                  release.artworkUrl ? (
                    <Image
                      src={release.artworkUrl}
                      alt=''
                      width={20}
                      height={20}
                      className='h-5 w-5 rounded-[3px] object-cover'
                      unoptimized
                    />
                  ) : (
                    <Disc3 className='h-4 w-4' />
                  )
                }
                label={release.title}
                url='#'
                badge={
                  release.releaseDate
                    ? new Date(
                        `${release.releaseDate}T00:00:00Z`
                      ).toLocaleDateString(undefined, { timeZone: 'UTC' })
                    : 'Pending'
                }
              />
            ))}
          </DrawerLinkSection>
        </StepFrame>
      );

    case 'late-arrivals':
      return (
        <StepFrame
          title='New matches'
          actions={
            <Button>
              Finish setup
              <ArrowRight className='ml-1 h-4 w-4' />
            </Button>
          }
        >
          {DEMO_LATE_ARRIVALS.map(item => (
            <div key={item.id}>
              <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                {item.subtitle}
              </p>
              <p className='mt-1 text-base font-[580] text-primary-token'>
                {item.title}
              </p>
            </div>
          ))}
        </StepFrame>
      );

    case 'profile-ready':
      return (
        <StepFrame
          title="You're all set"
          actions={
            <Button onClick={onFinish}>
              Open dashboard
              <ArrowRight className='ml-1 h-4 w-4' />
            </Button>
          }
        >
          <div className='grid grid-cols-3 gap-6'>
            <div>
              <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                Releases
              </p>
              <p className='mt-1 text-2xl font-[620] text-primary-token'>
                {snapshot.counts.releaseCount}
              </p>
            </div>
            <div>
              <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                DSPs
              </p>
              <p className='mt-1 text-2xl font-[620] text-primary-token'>
                {snapshot.counts.dspCount}
              </p>
            </div>
            <div>
              <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                Social
              </p>
              <p className='mt-1 text-2xl font-[620] text-primary-token'>
                {snapshot.counts.activeSocialCount}
              </p>
            </div>
          </div>
        </StepFrame>
      );
  }
}
