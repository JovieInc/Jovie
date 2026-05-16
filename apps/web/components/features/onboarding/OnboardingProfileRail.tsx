'use client';

import {
  Circle,
  CircleCheckBig,
  Gauge,
  Music2,
  UserRound,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import {
  formatCompactCount,
  formatExactCount,
  formatGenreLabel,
  getSafeSpotifyArtistUrl,
} from './OnboardingToolArtifacts';

export interface OnboardingProfileArtist {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly imageUrl?: string | null;
  readonly followers?: number | null;
  readonly popularity?: number | null;
  readonly genres?: readonly string[];
}

export interface OnboardingProfileBuilderState {
  readonly artist: OnboardingProfileArtist | null;
  readonly artistConfirmed: boolean;
  readonly handle: string | null;
  readonly socialLinks: readonly string[];
}

export const EMPTY_ONBOARDING_PROFILE_BUILDER_STATE: OnboardingProfileBuilderState =
  {
    artist: null,
    artistConfirmed: false,
    handle: null,
    socialLinks: [],
  };

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();
}

function hostnameFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function RailAvatar({ artist }: { readonly artist: OnboardingProfileArtist }) {
  if (artist.imageUrl) {
    return (
      <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-surface-0'>
        <Image
          src={artist.imageUrl}
          alt=''
          width={40}
          height={40}
          className='h-full w-full object-cover'
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-[11px] font-semibold text-secondary-token'
      aria-hidden
    >
      {getInitials(artist.name) || <UserRound className='h-4 w-4' />}
    </div>
  );
}

function RailMatchBadge({
  artistName,
  href,
  label,
  tone,
}: {
  readonly artistName: string;
  readonly href: string | null;
  readonly label: string;
  readonly tone: 'matched' | 'selected';
}) {
  const className = cn(
    'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[10.5px] font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
    tone === 'matched'
      ? 'border-green-500/20 text-green-500'
      : 'border-cyan-400/20 text-cyan-300',
    href && 'hover:bg-surface-2'
  );
  const content = (
    <>
      <SocialIcon platform='spotify' className='h-3 w-3' aria-hidden />
      <span>{label}</span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target='_blank'
        rel='noreferrer'
        className={className}
        aria-label={`Open ${artistName} on Spotify`}
      >
        {content}
      </a>
    );
  }

  return <span className={className}>{content}</span>;
}

function RailMetric({
  children,
  icon,
  title,
}: {
  readonly children: ReactNode;
  readonly icon: ReactNode;
  readonly title: string;
}) {
  return (
    <span
      className='inline-flex h-6 items-center gap-1 rounded-full border border-subtle bg-surface-0 px-2 text-[11.5px] leading-none text-secondary-token'
      title={title}
    >
      <span className='text-tertiary-token' aria-hidden>
        {icon}
      </span>
      <span className='sr-only'>{title}</span>
      <span aria-hidden>{children}</span>
    </span>
  );
}

function TimelineItem({
  body,
  state,
  title,
}: {
  readonly body: string;
  readonly state: 'done' | 'active' | 'pending';
  readonly title: string;
}) {
  return (
    <li className='relative z-10 grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 max-lg:gap-2'>
      <span
        className={cn(
          'mt-0.5 flex h-[18px] w-[18px] items-center justify-center',
          state === 'done'
            ? 'text-green-500'
            : state === 'active'
              ? 'text-cyan-300'
              : 'text-tertiary-token'
        )}
        aria-hidden
      >
        {state === 'done' ? (
          <CircleCheckBig className='h-[18px] w-[18px]' strokeWidth={2.65} />
        ) : (
          <Circle
            className={cn('h-2.5 w-2.5', state === 'active' && 'fill-current')}
            strokeWidth={2.4}
          />
        )}
      </span>
      <span className='min-w-0'>
        <span className='block text-[12.5px] font-medium leading-5 text-primary-token'>
          {title}
        </span>
        <span
          className={cn(
            'block text-[12px] leading-5 text-tertiary-token max-lg:text-[11.5px] max-lg:leading-4',
            state === 'pending' && 'max-lg:hidden'
          )}
        >
          {body}
        </span>
      </span>
    </li>
  );
}

export function OnboardingProfileRail({
  placement = 'side',
  state,
}: {
  readonly placement?: 'inline' | 'side';
  readonly state: OnboardingProfileBuilderState;
}) {
  const artist = state.artist;
  const visible = Boolean(artist);
  const followers = formatCompactCount(artist?.followers);
  const exactFollowers = formatExactCount(artist?.followers);
  const genres = artist?.genres?.slice(0, 2).map(formatGenreLabel) ?? [];
  const firstSocialLink = state.socialLinks[0] ?? null;
  const safeArtistUrl = getSafeSpotifyArtistUrl(artist?.url);
  const isInline = placement === 'inline';

  return (
    <aside
      className={cn(
        'overflow-hidden bg-(--linear-app-content-surface) text-primary-token transition-[opacity,transform,width,border-color] duration-cinematic ease-out',
        isInline
          ? 'relative z-0 w-full rounded-2xl border border-(--linear-app-shell-border)'
          : 'z-30 max-lg:hidden lg:relative lg:h-full lg:border-l lg:border-(--linear-app-shell-border)',
        visible
          ? cn(
              'pointer-events-auto opacity-100',
              isInline ? 'translate-y-0' : 'lg:w-[322px] lg:translate-x-0'
            )
          : cn(
              'pointer-events-none opacity-0',
              isInline ? 'hidden' : 'lg:w-0 lg:translate-x-3'
            )
      )}
      aria-hidden={!visible}
      data-testid={
        isInline ? 'onboarding-profile-rail-inline' : 'onboarding-profile-rail'
      }
      data-visible={visible ? 'true' : 'false'}
      data-placement={placement}
    >
      <div className={cn(!isInline && 'lg:w-[322px]')}>
        <div className='border-b border-(--linear-app-shell-border) px-4 py-3.5 max-lg:px-3.5 max-lg:py-3'>
          <p className='text-[12px] font-medium leading-5 text-secondary-token'>
            Artist Profile
          </p>
          <p className='text-[13px] font-semibold leading-5 text-primary-token'>
            {artist ? `Building ${artist.name}` : 'Building profile'}
          </p>
        </div>

        {artist ? (
          <div className='space-y-4 px-4 py-4 max-lg:space-y-3 max-lg:px-3.5 max-lg:py-3'>
            <div className='rounded-xl border border-subtle bg-surface-1 p-3 max-lg:p-2.5'>
              <div className='flex items-start gap-3'>
                <RailAvatar artist={artist} />
                <div className='min-w-0 flex-1'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <p className='truncate text-[13.5px] font-semibold leading-5 text-primary-token'>
                      {artist.name}
                    </p>
                    <RailMatchBadge
                      artistName={artist.name}
                      href={safeArtistUrl}
                      label={state.artistConfirmed ? 'Matched' : 'Selected'}
                      tone={state.artistConfirmed ? 'matched' : 'selected'}
                    />
                  </div>
                </div>
              </div>

              <div className='mt-3 flex flex-wrap gap-1.5'>
                {followers ? (
                  <RailMetric
                    icon={<Users className='h-3 w-3' />}
                    title={`${exactFollowers ?? followers} Spotify followers`}
                  >
                    {followers}
                  </RailMetric>
                ) : null}
                {typeof artist.popularity === 'number' ? (
                  <RailMetric
                    icon={<Gauge className='h-3 w-3' />}
                    title={`Popularity score: ${artist.popularity} out of 100`}
                  >
                    {artist.popularity}
                  </RailMetric>
                ) : null}
                {genres.map(genre => (
                  <RailMetric
                    key={genre}
                    icon={<Music2 className='h-3 w-3' />}
                    title={`Genre: ${genre}`}
                  >
                    {genre}
                  </RailMetric>
                ))}
              </div>
            </div>

            <ol
              className='relative space-y-3 before:absolute before:bottom-2 before:left-[8.5px] before:top-2 before:w-px before:bg-(--linear-app-shell-border) max-lg:space-y-2.5'
              aria-label='Profile build progress'
            >
              <TimelineItem
                title='Spotify artist'
                body={
                  state.artistConfirmed
                    ? 'Profile matched and ready to build from.'
                    : 'Selected. Jovie is matching the Spotify profile.'
                }
                state={state.artistConfirmed ? 'done' : 'active'}
              />
              <TimelineItem
                title='Profile context'
                body={
                  state.artistConfirmed
                    ? 'Next question: why this needs fixing now.'
                    : 'Waiting for the Spotify match.'
                }
                state={state.artistConfirmed ? 'active' : 'pending'}
              />
              <TimelineItem
                title='Social links'
                body={
                  firstSocialLink
                    ? hostnameFor(firstSocialLink)
                    : 'Instagram, TikTok, store, and other public links.'
                }
                state={firstSocialLink ? 'done' : 'pending'}
              />
              <TimelineItem
                title='Public profile'
                body={
                  state.handle
                    ? `jov.ie/${state.handle}`
                    : 'Profile preview appears after handle and links.'
                }
                state={state.handle ? 'active' : 'pending'}
              />
            </ol>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
