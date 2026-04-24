'use client';

import { Play } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { ReleaseCountdown } from '@/components/features/release/ReleaseCountdown';
import { profileSecondaryPillClassName } from '@/features/profile/artist-notifications-cta/shared';
import type { ProfileRenderMode } from '@/features/profile/contracts';
import { useTourDateProximity } from '@/hooks/useTourDateProximity';
import type { UserLocation } from '@/hooks/useUserLocation';
import { useUserLocation } from '@/hooks/useUserLocation';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';

export interface ProfilePrimaryActionCardRelease {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly revealDate?: Date | string | null;
  readonly releaseType: string;
  readonly metadata?: Record<string, unknown> | null;
}

type ProfileCardReleaseState = {
  readonly kind: 'release_countdown' | 'release_live';
  readonly release: ProfilePrimaryActionCardRelease;
  readonly collaboratorLine: string | null;
};

type ProfileCardTourState = {
  readonly kind: 'tour_nearby' | 'tour_next';
  readonly tourDate: TourDateViewModel;
};

type ProfileCardPlaylistState = {
  readonly kind: 'playlist_fallback';
  readonly playlist: ConfirmedFeaturedPlaylistFallback;
};

type ProfileCardListenFallbackState = {
  readonly kind: 'listen_fallback';
};

type ProfileCardNoneState = {
  readonly kind: 'none';
};

export type ProfilePrimaryActionCardState =
  | ProfileCardReleaseState
  | ProfileCardTourState
  | ProfileCardPlaylistState
  | ProfileCardListenFallbackState
  | ProfileCardNoneState;

interface ResolveProfilePrimaryActionCardStateOptions {
  readonly artistName: string;
  readonly latestRelease?: ProfilePrimaryActionCardRelease | null;
  readonly profileSettings?: {
    readonly showOldReleases?: boolean;
  } | null;
  readonly nextTourDate?: TourDateViewModel | null;
  readonly nearbyTourDate?: TourDateViewModel | null;
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly hasPlayableDestinations: boolean;
  readonly now?: Date;
}

interface ProfilePrimaryActionCardProps {
  readonly artist: Artist;
  readonly latestRelease?: ProfilePrimaryActionCardRelease | null;
  readonly profileSettings?: {
    readonly showOldReleases?: boolean;
  } | null;
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly tourDates?: readonly TourDateViewModel[];
  readonly hasPlayableDestinations: boolean;
  readonly renderMode?: ProfileRenderMode;
  readonly previewActionLabel?: string;
  readonly onPlayClick?: () => void;
  readonly viewerLocation?: UserLocation | null;
  readonly resolveNearbyTour?: boolean;
  readonly className?: string;
  readonly dataTestId?: string;
  readonly size?: 'compact' | 'showcase';
  readonly now?: Date;
}

const CTA_PILL_CLASS_NAME = cn(
  profileSecondaryPillClassName,
  'h-7 rounded-full border-white/14 bg-white text-[11px] font-semibold text-black shadow-[0_10px_24px_rgba(255,255,255,0.16)] hover:bg-white hover:text-black'
);

function toDateValue(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3])
      )
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getReleaseArtistNames(
  release: ProfilePrimaryActionCardRelease | null | undefined
) {
  const artistNames = release?.metadata?.artistNames;

  if (!Array.isArray(artistNames)) {
    return [];
  }

  return artistNames.filter(
    (name): name is string => typeof name === 'string' && name.trim().length > 0
  );
}

function getReleaseCollaboratorLine(
  release: ProfilePrimaryActionCardRelease,
  artistName: string
) {
  const collaborators = getReleaseArtistNames(release).filter(
    name => name.toLowerCase() !== artistName.toLowerCase()
  );

  if (collaborators.length === 0) {
    return null;
  }

  return `w/ ${collaborators.join(', ')}`;
}

function getUpcomingTourDates(
  tourDates: readonly TourDateViewModel[],
  now?: Date
) {
  const today = startOfLocalDay(now ?? new Date());

  return [...tourDates]
    .filter(tourDate => {
      const start = toDateValue(tourDate.startDate);
      return (
        start !== null && startOfLocalDay(start).getTime() >= today.getTime()
      );
    })
    .sort(
      (left, right) =>
        (toDateValue(left.startDate)?.getTime() ?? 0) -
        (toDateValue(right.startDate)?.getTime() ?? 0)
    );
}

function getMonthLabel(date: string) {
  const dateValue = toDateValue(date);
  if (!dateValue) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(dateValue);
}

function getDayLabel(date: string) {
  const dateValue = toDateValue(date);
  if (!dateValue) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(dateValue);
}

function getTourLocationLabel(tourDate: TourDateViewModel) {
  return [tourDate.city, tourDate.region].filter(Boolean).join(', ');
}

function ActionCardShell({
  kind,
  href,
  onClick,
  className,
  dataTestId,
  children,
}: Readonly<{
  kind: ProfilePrimaryActionCardState['kind'];
  href?: string | null;
  onClick?: () => void;
  className: string;
  dataTestId?: string;
  children: ReactNode;
}>) {
  const sharedProps = {
    className,
    'data-state': kind,
    'data-testid': dataTestId,
  };

  if (href?.startsWith('/')) {
    return (
      <Link href={href} prefetch={false} {...sharedProps}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} target='_blank' rel='noopener noreferrer' {...sharedProps}>
        {children}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type='button' onClick={onClick} {...sharedProps}>
        {children}
      </button>
    );
  }

  return <div {...sharedProps}>{children}</div>;
}

function ActionPill({
  label,
  emphasis = 'light',
}: Readonly<{
  label: string;
  emphasis?: 'light' | 'dark';
}>) {
  return (
    <span
      className={cn(
        CTA_PILL_CLASS_NAME,
        emphasis === 'dark' &&
          'border-white/14 bg-white/[0.08] text-white shadow-none hover:bg-white/[0.1] hover:text-white'
      )}
    >
      {label}
    </span>
  );
}

export function resolveProfilePrimaryActionCardState({
  artistName,
  latestRelease,
  profileSettings,
  nextTourDate,
  nearbyTourDate,
  featuredPlaylistFallback,
  hasPlayableDestinations,
  now,
}: ResolveProfilePrimaryActionCardStateOptions): ProfilePrimaryActionCardState {
  const releaseVisibility = getProfileReleaseVisibility(
    latestRelease,
    profileSettings,
    now
  );

  if (
    releaseVisibility?.show &&
    releaseVisibility.isCountdown &&
    latestRelease
  ) {
    return {
      kind: 'release_countdown',
      release: latestRelease,
      collaboratorLine: getReleaseCollaboratorLine(latestRelease, artistName),
    };
  }

  if (
    releaseVisibility?.show &&
    !releaseVisibility.isCountdown &&
    latestRelease
  ) {
    return {
      kind: 'release_live',
      release: latestRelease,
      collaboratorLine: getReleaseCollaboratorLine(latestRelease, artistName),
    };
  }

  if (nearbyTourDate) {
    return { kind: 'tour_nearby', tourDate: nearbyTourDate };
  }

  if (nextTourDate) {
    return { kind: 'tour_next', tourDate: nextTourDate };
  }

  if (featuredPlaylistFallback) {
    return { kind: 'playlist_fallback', playlist: featuredPlaylistFallback };
  }

  if (hasPlayableDestinations) {
    return { kind: 'listen_fallback' };
  }

  return { kind: 'none' };
}

export function ProfilePrimaryActionCard({
  artist,
  latestRelease,
  profileSettings,
  featuredPlaylistFallback,
  tourDates = [],
  hasPlayableDestinations,
  renderMode = 'interactive',
  previewActionLabel = 'Listen',
  onPlayClick,
  viewerLocation,
  resolveNearbyTour = true,
  className,
  dataTestId = 'profile-primary-action-card',
  size = 'compact',
  now,
}: Readonly<ProfilePrimaryActionCardProps>) {
  const upcomingTourDates = useMemo(
    () => getUpcomingTourDates(tourDates, now),
    [now, tourDates]
  );
  const nextTourDate = upcomingTourDates[0] ?? null;
  const releaseVisibility = useMemo(
    () => getProfileReleaseVisibility(latestRelease, profileSettings, now),
    [latestRelease, now, profileSettings]
  );
  const shouldResolveGeo =
    resolveNearbyTour &&
    viewerLocation === undefined &&
    !releaseVisibility?.show &&
    upcomingTourDates.length > 0;
  const { location } = useUserLocation({ enabled: shouldResolveGeo });
  const effectiveLocation = viewerLocation ?? location;
  const { nearbyDates } = useTourDateProximity(
    upcomingTourDates,
    effectiveLocation
  );
  const nearbyTourDate = resolveNearbyTour
    ? (nearbyDates[0]?.date ?? null)
    : null;
  const state = useMemo(
    () =>
      resolveProfilePrimaryActionCardState({
        artistName: artist.name,
        latestRelease,
        profileSettings,
        nextTourDate,
        nearbyTourDate,
        featuredPlaylistFallback,
        hasPlayableDestinations,
        now,
      }),
    [
      artist.name,
      featuredPlaylistFallback,
      hasPlayableDestinations,
      latestRelease,
      nearbyTourDate,
      nextTourDate,
      now,
      profileSettings,
    ]
  );

  if (state.kind === 'none') {
    return null;
  }

  const isShowcase = size === 'showcase';
  const shellClassName = cn(
    'group flex w-full items-center gap-3 rounded-[var(--profile-action-radius)] border border-white/[0.08] bg-white/[0.05] text-left backdrop-blur-2xl transition-[background-color,transform,box-shadow] duration-150 hover:bg-white/[0.08] active:scale-[0.985]',
    isShowcase
      ? 'min-h-[92px] px-4 py-3.5 shadow-[0_22px_58px_rgba(0,0,0,0.34)]'
      : 'min-h-[64px] px-3 py-2.5',
    className
  );
  const artClassName = isShowcase
    ? 'h-14 w-14 rounded-[14px]'
    : 'h-11 w-11 rounded-xl';
  const titleClassName = isShowcase
    ? 'text-base font-[630] tracking-[-0.03em] text-white'
    : 'text-app font-semibold leading-[1.1] text-white/92';
  const metaClassName = isShowcase
    ? 'text-[11.5px] text-white/56'
    : 'text-[10.5px] text-white/52';
  const artistMetaLine = (
    <p className={cn('truncate font-semibold', metaClassName)}>{artist.name}</p>
  );

  if (state.kind === 'release_countdown' || state.kind === 'release_live') {
    const href = `/${artist.handle}/${state.release.slug}`;
    const wrapperHref =
      state.kind === 'release_countdown' || !onPlayClick ? href : undefined;
    const actionClick = state.kind === 'release_live' ? onPlayClick : undefined;
    const actionLabel =
      renderMode === 'preview' ? previewActionLabel : 'Listen';
    const releaseDate = toDateValue(state.release.releaseDate);

    return (
      <ActionCardShell
        kind={state.kind}
        href={wrapperHref}
        onClick={actionClick}
        className={shellClassName}
        dataTestId={dataTestId}
      >
        {state.release.artworkUrl ? (
          <div
            className={cn('relative shrink-0 overflow-hidden', artClassName)}
          >
            <ImageWithFallback
              src={state.release.artworkUrl}
              alt={`${state.release.title} artwork`}
              fill
              sizes={isShowcase ? '56px' : '44px'}
              className='object-cover'
              fallbackVariant='release'
            />
          </div>
        ) : (
          <div
            className={cn(
              'flex shrink-0 items-center justify-center bg-white/[0.05] text-white/62',
              artClassName
            )}
          >
            <Play className='h-4 w-4 fill-current' />
          </div>
        )}

        <div className='min-w-0 flex-1'>
          <p className={cn('truncate', titleClassName)}>
            {state.release.title}
          </p>
          <div className='mt-1 space-y-0.5'>
            {artistMetaLine}
            {state.collaboratorLine ? (
              <p className={cn('truncate font-caption', metaClassName)}>
                {state.collaboratorLine}
              </p>
            ) : null}
          </div>
        </div>

        {state.kind === 'release_countdown' ? (
          releaseDate ? (
            <div className='shrink-0 rounded-[18px] border border-white/10 bg-black/16 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
              <ReleaseCountdown releaseDate={releaseDate} compact />
            </div>
          ) : (
            <ActionPill label={actionLabel} />
          )
        ) : (
          <ActionPill label={actionLabel} />
        )}
      </ActionCardShell>
    );
  }

  if (state.kind === 'tour_nearby' || state.kind === 'tour_next') {
    const locationLabel =
      getTourLocationLabel(state.tourDate) || 'Upcoming show';
    const ctaLabel = state.tourDate.ticketUrl ? 'Tickets' : 'Details';

    return (
      <ActionCardShell
        kind={state.kind}
        href={state.tourDate.ticketUrl ?? `/${artist.handle}/tour`}
        className={shellClassName}
        dataTestId={dataTestId}
      >
        <div
          className={cn(
            'flex shrink-0 flex-col items-center justify-center bg-white/[0.04] leading-none text-white',
            artClassName
          )}
        >
          <span className='text-[9px] font-semibold uppercase tracking-[0.14em] text-white/48'>
            {getMonthLabel(state.tourDate.startDate)}
          </span>
          <span className='mt-1 text-xl font-bold tracking-[-0.06em]'>
            {getDayLabel(state.tourDate.startDate)}
          </span>
        </div>

        <div className='min-w-0 flex-1'>
          <p className={cn('truncate', titleClassName)}>
            {state.tourDate.venueName ?? artist.name}
          </p>
          <div className='mt-1 space-y-0.5'>
            <p className={cn('truncate font-semibold', metaClassName)}>
              {locationLabel}
            </p>
            <p className={cn('truncate font-caption', metaClassName)}>
              {state.kind === 'tour_nearby' ? 'Near you' : 'Next date'}
            </p>
          </div>
        </div>

        <ActionPill label={ctaLabel} emphasis='dark' />
      </ActionCardShell>
    );
  }

  if (state.kind === 'playlist_fallback') {
    return (
      <ActionCardShell
        kind={state.kind}
        href={state.playlist.url}
        className={shellClassName}
        dataTestId={dataTestId}
      >
        {state.playlist.imageUrl ? (
          <div
            className={cn('relative shrink-0 overflow-hidden', artClassName)}
          >
            <ImageWithFallback
              src={state.playlist.imageUrl}
              alt={state.playlist.title}
              fill
              sizes={isShowcase ? '56px' : '44px'}
              className='object-cover'
              fallbackVariant='release'
            />
          </div>
        ) : (
          <div
            className={cn(
              'flex shrink-0 items-center justify-center bg-white/[0.05] text-white/62',
              artClassName
            )}
          >
            <Play className='h-4 w-4 fill-current' />
          </div>
        )}

        <div className='min-w-0 flex-1'>
          <p className={cn('truncate', titleClassName)}>
            {state.playlist.title}
          </p>
          <div className='mt-1 space-y-0.5'>{artistMetaLine}</div>
        </div>

        <ActionPill label='Open playlist' emphasis='dark' />
      </ActionCardShell>
    );
  }

  return (
    <ActionCardShell
      kind={state.kind}
      href={onPlayClick ? undefined : `/${artist.handle}/listen`}
      onClick={onPlayClick}
      className={shellClassName}
      dataTestId={dataTestId}
    >
      {artist.image_url ? (
        <div className={cn('relative shrink-0 overflow-hidden', artClassName)}>
          <ImageWithFallback
            src={artist.image_url}
            alt={artist.name}
            fill
            sizes={isShowcase ? '56px' : '44px'}
            className='object-cover'
            fallbackVariant='avatar'
          />
        </div>
      ) : (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center bg-white/[0.05] text-white/62',
            artClassName
          )}
        >
          <Play className='h-4 w-4 fill-current' />
        </div>
      )}

      <div className='min-w-0 flex-1'>
        <p className={cn('truncate', titleClassName)}>{artist.name}</p>
        <div className='mt-1 space-y-0.5'>
          <p className={cn('truncate font-semibold', metaClassName)}>
            Listen across your preferred platforms
          </p>
        </div>
      </div>

      <ActionPill
        label={renderMode === 'preview' ? previewActionLabel : 'Listen'}
      />
    </ActionCardShell>
  );
}
