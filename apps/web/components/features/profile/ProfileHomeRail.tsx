'use client';

import { Play } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import type {
  ProfileRailCard,
  ProfileRenderMode,
} from '@/features/profile/contracts';
import {
  type ProfilePrimaryActionCardRelease,
  resolveProfilePrimaryActionCardState,
} from '@/features/profile/ProfilePrimaryActionCard';
import { useTourDateProximity } from '@/hooks/useTourDateProximity';
import type { UserLocation } from '@/hooks/useUserLocation';
import { useUserLocation } from '@/hooks/useUserLocation';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import type { Artist } from '@/types/db';

interface ProfileHomeRailProps {
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
}

type FeaturedRailKind =
  | 'release_countdown'
  | 'release_live'
  | 'tour_nearby'
  | 'tour_next'
  | 'playlist_fallback'
  | 'listen_fallback'
  | 'none';

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

function getUpcomingTourDates(
  tourDates: readonly TourDateViewModel[],
  now = new Date()
) {
  const today = startOfLocalDay(now);

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

function formatMonthLabel(value: string | null | undefined) {
  const date = toDateValue(value);
  if (!date) {
    return 'Soon';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
  }).format(date);
}

function formatDayLabel(value: string | null | undefined) {
  const date = toDateValue(value);
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
  }).format(date);
}

function formatDateLabel(value: string | Date | null | undefined) {
  const date = toDateValue(value);
  if (!date) {
    return 'Soon';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatTourLocation(tourDate: TourDateViewModel) {
  return [tourDate.city, tourDate.region].filter(Boolean).join(', ');
}

function formatReleaseType(value: string | null | undefined) {
  if (!value) {
    return 'Release';
  }

  return capitalizeFirst(value.replaceAll('_', ' '));
}

function getFeaturedRailCardKind(kind: FeaturedRailKind) {
  switch (kind) {
    case 'release_countdown':
    case 'release_live':
      return 'release';
    case 'tour_nearby':
    case 'tour_next':
      return 'tour';
    case 'playlist_fallback':
      return 'playlist';
    case 'listen_fallback':
      return 'listen';
    default:
      return null;
  }
}

export function buildProfileRailCards(params: {
  latestReleaseVisible: boolean;
  hasUpcomingTourDates: boolean;
  hasPlaylistFallback: boolean;
  hasListenFallback: boolean;
  featuredKind: FeaturedRailKind;
}): ProfileRailCard[] {
  const cards: ProfileRailCard[] = [];
  const usedKinds = new Set<ProfileRailCard['kind']>();

  const pushCard = (kind: ProfileRailCard['kind']) => {
    if (usedKinds.has(kind) || cards.length >= 3) {
      return;
    }

    usedKinds.add(kind);
    cards.push({ id: `profile-rail-${kind}`, kind });
  };

  const featuredRailKind = getFeaturedRailCardKind(params.featuredKind);
  if (featuredRailKind) {
    pushCard(featuredRailKind);
  }

  if (params.latestReleaseVisible) {
    pushCard('release');
  }
  if (params.hasUpcomingTourDates) {
    pushCard('tour');
  }
  if (params.hasPlaylistFallback) {
    pushCard('playlist');
  }
  if (params.hasListenFallback) {
    pushCard('listen');
  }

  return cards;
}

function RailCardShell({
  href,
  onClick,
  className,
  dataTestId,
  dataState,
  ariaLabel,
  children,
}: Readonly<{
  href?: string | null;
  onClick?: () => void;
  className?: string;
  dataTestId: string;
  dataState?: string;
  ariaLabel: string;
  children: ReactNode;
}>) {
  const sharedProps = {
    className: cn(
      'group relative flex min-h-[286px] w-full overflow-hidden rounded-[30px] border border-white/12 bg-[#0d0f12] text-left shadow-[0_32px_72px_rgba(0,0,0,0.38)] transition-[background-color,border-color] duration-200 hover:border-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
      className
    ),
    'data-testid': dataTestId,
    'data-state': dataState,
    'aria-label': ariaLabel,
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

function LabelChip({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className='inline-flex h-10 w-fit items-center rounded-full border border-[color:var(--profile-status-pill-border)] bg-[color:var(--profile-status-pill-bg)] px-3.5 text-[12px] font-semibold tracking-[-0.01em] text-[color:var(--profile-accent-primary)] backdrop-blur-xl'>
      {children}
    </span>
  );
}

function CircleAction({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <span className='inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/14 bg-black/46 text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl'>
      {children}
    </span>
  );
}

function ImageLedRailCard({
  dataTestId,
  ariaLabel,
  imageUrl,
  href,
  onClick,
  label,
  title,
  subtitle,
  actionIcon,
  actionLabel,
  dataState,
}: Readonly<{
  dataTestId: string;
  ariaLabel: string;
  imageUrl?: string | null;
  href?: string | null;
  onClick?: () => void;
  label: string;
  title: string;
  subtitle: string;
  actionIcon: ReactNode;
  actionLabel?: string;
  dataState?: string;
}>) {
  return (
    <RailCardShell
      href={href}
      onClick={onClick}
      dataTestId={dataTestId}
      dataState={dataState}
      ariaLabel={ariaLabel}
    >
      <div className='absolute inset-0'>
        <ImageWithFallback
          src={imageUrl}
          alt={title}
          fill
          sizes='280px'
          className='object-cover object-center'
          fallbackVariant='release'
          fallbackClassName='bg-surface-2'
        />
      </div>
      <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(4,5,6,0.06)_0%,rgba(4,5,6,0.2)_38%,rgba(4,5,6,0.86)_100%)]' />
      <div className='relative flex min-h-[286px] flex-col justify-between p-[22px]'>
        <LabelChip>{label}</LabelChip>
        <div className='space-y-5'>
          <div className='space-y-1.5'>
            <p className='max-w-[15ch] text-[29px] font-semibold leading-[1.04] tracking-[-0.055em] text-white'>
              {title}
            </p>
            <p className='text-[16px] leading-6 text-white/72'>{subtitle}</p>
          </div>
          {actionLabel ? (
            <span className='inline-flex h-14 items-center gap-3 rounded-[17px] bg-white px-6 text-[16px] font-semibold tracking-[-0.025em] text-black shadow-[0_18px_40px_rgba(0,0,0,0.32)]'>
              {actionIcon}
              {actionLabel}
            </span>
          ) : (
            <CircleAction>{actionIcon}</CircleAction>
          )}
        </div>
      </div>
    </RailCardShell>
  );
}

function TourRailCard({
  artistHandle,
  stateKind,
  tourDate,
}: Readonly<{
  artistHandle: string;
  stateKind: 'tour_nearby' | 'tour_next';
  tourDate: TourDateViewModel;
}>) {
  const href = tourDate.ticketUrl ?? `/${artistHandle}?mode=tour`;
  const locationLabel = formatTourLocation(tourDate) || 'Upcoming show';

  return (
    <RailCardShell
      href={href}
      dataTestId='profile-home-rail-tour'
      dataState={stateKind}
      ariaLabel={`Open ${tourDate.venueName ?? 'tour details'}`}
      className='bg-[linear-gradient(180deg,rgba(26,28,33,0.96),rgba(12,13,17,0.98))]'
    >
      <div className='relative flex min-h-[286px] flex-col justify-between p-[22px]'>
        <LabelChip>
          {stateKind === 'tour_nearby' ? 'On Tour' : 'Upcoming Show'}
        </LabelChip>

        <div className='space-y-3.5'>
          <div className='flex items-end justify-between gap-4'>
            <div className='flex min-w-0 items-end gap-4'>
              <div className='border-r border-white/12 pr-4'>
                <p className='text-[14px] font-medium text-white/54'>
                  {formatMonthLabel(tourDate.startDate)}
                </p>
                <p className='mt-1 text-[46px] font-semibold leading-none tracking-[-0.08em] text-white'>
                  {formatDayLabel(tourDate.startDate)}
                </p>
              </div>
              <div className='min-w-0 space-y-1.5 pb-1'>
                <p className='max-w-[11ch] text-[24px] font-semibold leading-[1.04] tracking-[-0.05em] text-white'>
                  {tourDate.venueName ?? 'Tour Date'}
                </p>
                <p className='text-[15px] leading-5 text-white/72'>
                  {locationLabel}
                </p>
              </div>
            </div>

            <span className='inline-flex h-12 shrink-0 items-center rounded-[15px] bg-white/10 px-5 text-[15px] font-semibold text-white shadow-[0_16px_34px_rgba(0,0,0,0.22)] backdrop-blur-xl'>
              Tickets
            </span>
          </div>

          <p className='text-[15px] font-medium text-white/54'>
            {stateKind === 'tour_nearby' ? 'Near You' : 'Next Show'}
          </p>
        </div>
      </div>
    </RailCardShell>
  );
}

export function ProfileHomeRail({
  artist,
  latestRelease,
  profileSettings,
  featuredPlaylistFallback,
  tourDates = [],
  hasPlayableDestinations,
  renderMode = 'interactive',
  onPlayClick,
  viewerLocation,
  resolveNearbyTour = true,
}: Readonly<ProfileHomeRailProps>) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const upcomingTourDates = useMemo(
    () => getUpcomingTourDates(tourDates),
    [tourDates]
  );
  const isPreviewRail = renderMode === 'preview';
  const releaseVisibility = useMemo(
    () => getProfileReleaseVisibility(latestRelease, profileSettings),
    [latestRelease, profileSettings]
  );
  const shouldResolveGeo =
    resolveNearbyTour &&
    viewerLocation === undefined &&
    upcomingTourDates.length > 0 &&
    !releaseVisibility?.show;
  const { location } = useUserLocation({ enabled: shouldResolveGeo });
  const effectiveLocation = viewerLocation ?? location;
  const { nearbyDates } = useTourDateProximity(
    upcomingTourDates,
    effectiveLocation
  );
  const nextTourDate = upcomingTourDates[0] ?? null;
  const nearbyTourDate = nearbyDates[0]?.date ?? null;
  const featuredState = useMemo(
    () =>
      resolveProfilePrimaryActionCardState({
        artistName: artist.name,
        latestRelease,
        profileSettings,
        nextTourDate,
        nearbyTourDate,
        featuredPlaylistFallback,
        hasPlayableDestinations,
      }),
    [
      artist.name,
      featuredPlaylistFallback,
      hasPlayableDestinations,
      latestRelease,
      nearbyTourDate,
      nextTourDate,
      profileSettings,
    ]
  );
  const cards = useMemo(
    () =>
      buildProfileRailCards({
        latestReleaseVisible: Boolean(releaseVisibility?.show && latestRelease),
        hasUpcomingTourDates: upcomingTourDates.length > 0,
        hasPlaylistFallback: Boolean(featuredPlaylistFallback),
        hasListenFallback: hasPlayableDestinations,
        featuredKind: featuredState.kind,
      }),
    [
      featuredPlaylistFallback,
      featuredState.kind,
      hasPlayableDestinations,
      latestRelease,
      releaseVisibility?.show,
      upcomingTourDates.length,
    ]
  );

  useEffect(() => {
    const container = railRef.current;
    if (!container) {
      return;
    }

    const updateActiveCard = () => {
      const cardElements = Array.from(
        container.querySelectorAll<HTMLElement>('[data-rail-card-index]')
      );
      if (cardElements.length === 0) {
        return;
      }

      const containerLeft = container.getBoundingClientRect().left;
      const nextIndex = cardElements.reduce(
        (best, element, index) => {
          const distance = Math.abs(
            element.getBoundingClientRect().left - containerLeft
          );
          return distance < best.distance ? { index, distance } : best;
        },
        { index: 0, distance: Number.POSITIVE_INFINITY }
      ).index;

      setActiveIndex(nextIndex);
    };

    updateActiveCard();
    container.addEventListener('scroll', updateActiveCard, { passive: true });
    globalThis.addEventListener('resize', updateActiveCard);
    return () => {
      container.removeEventListener('scroll', updateActiveCard);
      globalThis.removeEventListener('resize', updateActiveCard);
    };
  }, [cards.length]);

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className={cn(isPreviewRail ? 'space-y-3' : 'space-y-4')}>
      <p className='px-0.5 text-[24px] font-semibold leading-none tracking-[-0.05em] text-white'>
        Latest
      </p>
      <div
        ref={railRef}
        className={cn(
          '-mx-1 flex snap-x snap-mandatory overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          isPreviewRail ? 'gap-3.5' : 'gap-4'
        )}
        data-testid='profile-home-rail'
      >
        {cards.map((card, index) => (
          <div
            key={card.id}
            className={cn(
              'snap-start',
              isPreviewRail
                ? 'min-w-[calc(100%-92px)] sm:min-w-[calc(100%-112px)]'
                : 'min-w-[calc(100%-72px)] sm:min-w-[calc(100%-92px)]'
            )}
            data-rail-card-index={index}
          >
            {card.kind === 'release' && latestRelease ? (
              <ImageLedRailCard
                dataTestId='profile-home-rail-release'
                ariaLabel={`Open ${latestRelease.title}`}
                imageUrl={latestRelease.artworkUrl ?? artist.image_url}
                href={
                  featuredState.kind === 'release_live' && onPlayClick
                    ? null
                    : `/${artist.handle}/${latestRelease.slug}`
                }
                onClick={
                  featuredState.kind === 'release_live'
                    ? onPlayClick
                    : undefined
                }
                label={
                  featuredState.kind === 'release_countdown'
                    ? 'Coming Soon'
                    : 'Latest Release'
                }
                dataState={
                  featuredState.kind === 'release_countdown'
                    ? 'release_countdown'
                    : 'release_live'
                }
                title={latestRelease.title}
                subtitle={
                  featuredState.kind === 'release_countdown'
                    ? `Drops ${formatDateLabel(latestRelease.releaseDate)}`
                    : formatReleaseType(latestRelease.releaseType)
                }
                actionIcon={<Play className='h-5 w-5 fill-current' />}
                actionLabel={
                  featuredState.kind === 'release_countdown'
                    ? 'Remind Me'
                    : 'Listen Now'
                }
              />
            ) : null}

            {card.kind === 'tour' && (nearbyTourDate ?? nextTourDate) ? (
              <TourRailCard
                artistHandle={artist.handle}
                stateKind={
                  nearbyTourDate && resolveNearbyTour
                    ? 'tour_nearby'
                    : 'tour_next'
                }
                tourDate={(nearbyTourDate ?? nextTourDate)!}
              />
            ) : null}

            {card.kind === 'playlist' && featuredPlaylistFallback ? (
              <ImageLedRailCard
                dataTestId='profile-home-rail-playlist'
                ariaLabel={`Open ${featuredPlaylistFallback.title}`}
                imageUrl={featuredPlaylistFallback.imageUrl ?? artist.image_url}
                href={featuredPlaylistFallback.url}
                label='Featured Playlist'
                dataState='playlist_fallback'
                title={featuredPlaylistFallback.title}
                subtitle='Open Playlist'
                actionIcon={<Play className='h-5 w-5 fill-current' />}
                actionLabel='Listen Now'
              />
            ) : null}

            {card.kind === 'listen' ? (
              <ImageLedRailCard
                dataTestId='profile-home-rail-listen'
                ariaLabel={`Listen to ${artist.name}`}
                imageUrl={artist.image_url}
                href={onPlayClick ? null : `/${artist.handle}?mode=listen`}
                onClick={onPlayClick}
                label='Music'
                dataState='listen_fallback'
                title={artist.name}
                subtitle='Listen Across Your Preferred Platforms'
                actionIcon={<Play className='h-5 w-5 fill-current' />}
                actionLabel='Listen Now'
              />
            ) : null}
          </div>
        ))}
      </div>

      {cards.length > 1 ? (
        <div className='flex items-center justify-center gap-2'>
          {cards.map((card, index) => (
            <button
              key={`${card.id}-dot`}
              type='button'
              onClick={() => {
                const container = railRef.current;
                const target = container?.querySelector<HTMLElement>(
                  `[data-rail-card-index="${index}"]`
                );
                target?.scrollIntoView({
                  behavior: 'smooth',
                  inline: 'start',
                  block: 'nearest',
                });
              }}
              className={cn(
                'h-2.5 rounded-full transition-all duration-200',
                index === activeIndex
                  ? 'w-7 bg-[color:var(--profile-rail-dot-active)]'
                  : 'w-2.5 bg-[color:var(--profile-rail-dot-inactive)]'
              )}
              aria-label={`View rail card ${index + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
