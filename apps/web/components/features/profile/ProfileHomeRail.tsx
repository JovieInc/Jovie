'use client';

import { Bell, CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { profilePrimaryPillClassName } from '@/features/profile/artist-notifications-cta/shared';
import type {
  ProfilePreviewNotificationsState,
  ProfileRailCard,
  ProfileRenderMode,
} from '@/features/profile/contracts';
import {
  ProfilePrimaryActionCard,
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
  readonly onOpenAlerts?: () => void;
  readonly viewerLocation?: UserLocation | null;
  readonly resolveNearbyTour?: boolean;
  readonly isSubscribed?: boolean;
  readonly previewNotificationsState?: ProfilePreviewNotificationsState;
}

type ProfileDateInput = Date | string | null | undefined;

const PROFILE_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function normalizeProfileDateString(value: string): string | Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00`;
  }
  return value;
}

function getProfileDateValue(value: ProfileDateInput) {
  if (!value) {
    return null;
  }

  const normalizedValue =
    value instanceof Date ? new Date(value) : normalizeProfileDateString(value);
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getProfileLocalDayTimestamp(value: Date | string | null | undefined) {
  const date = getProfileDateValue(value);
  if (!date) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getUpcomingProfileTourDates(
  tourDates: readonly TourDateViewModel[],
  now = new Date()
) {
  const today = getProfileLocalDayTimestamp(now) ?? Number.NEGATIVE_INFINITY;

  return [...tourDates]
    .sort(
      (left, right) =>
        (getProfileLocalDayTimestamp(left.startDate) ??
          Number.MAX_SAFE_INTEGER) -
        (getProfileLocalDayTimestamp(right.startDate) ??
          Number.MAX_SAFE_INTEGER)
    )
    .filter(tourDate => {
      const start = getProfileLocalDayTimestamp(tourDate.startDate);
      return start !== null && start >= today;
    });
}

export function formatProfileDateLabel(
  value: Date | string | null | undefined
) {
  const date = getProfileDateValue(value);
  return date ? PROFILE_DATE_FORMATTER.format(date) : 'Soon';
}

function getFeaturedRailCardKind(
  kind:
    | 'release_countdown'
    | 'release_live'
    | 'tour_nearby'
    | 'tour_next'
    | 'playlist_fallback'
    | 'listen_fallback'
    | 'none'
) {
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
  hasAlertsCard: boolean;
  hasPlaylistFallback: boolean;
  hasListenFallback: boolean;
  featuredKind:
    | 'release_countdown'
    | 'release_live'
    | 'tour_nearby'
    | 'tour_next'
    | 'playlist_fallback'
    | 'listen_fallback'
    | 'none';
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
  if (params.hasAlertsCard) {
    pushCard('alerts');
  }
  if (params.hasPlaylistFallback) {
    pushCard('playlist');
  }
  if (params.hasListenFallback) {
    pushCard('listen');
  }

  return cards;
}

function AlertsRailCard({
  isSubscribed,
  onOpenAlerts,
  renderMode,
  previewNotificationsState,
}: Readonly<{
  isSubscribed: boolean;
  onOpenAlerts?: () => void;
  renderMode: ProfileRenderMode;
  previewNotificationsState?: ProfilePreviewNotificationsState;
}>) {
  let actionLabel: string;
  if (renderMode === 'preview') {
    actionLabel = previewNotificationsState?.label || 'Get alerts';
  } else if (isSubscribed) {
    actionLabel = 'Manage alerts';
  } else {
    actionLabel = 'Get alerts';
  }
  const title = isSubscribed ? 'Alerts are on' : 'Never miss a release';
  const body = isSubscribed
    ? 'Tune your music, tour, merch, and general update preferences.'
    : 'Get new music and tour updates by text or email the moment they land.';

  return (
    <button
      type='button'
      onClick={onOpenAlerts}
      className='flex min-h-[176px] w-full flex-col justify-between rounded-[var(--profile-card-radius)] border border-[color:var(--profile-panel-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))] p-5 text-left shadow-[var(--profile-panel-shadow)] backdrop-blur-2xl transition-transform duration-200 hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
      data-testid='profile-rail-alerts-card'
    >
      <div className='space-y-3'>
        <span className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--profile-status-pill-border)] bg-[color:var(--profile-status-pill-bg)] text-[color:var(--profile-status-pill-fg)]'>
          {isSubscribed ? (
            <CheckCircle2 className='h-4 w-4' />
          ) : (
            <Bell className='h-4 w-4' />
          )}
        </span>
        <div className='space-y-1'>
          <p className='text-sm font-semibold tracking-[-0.018em] text-primary-token'>
            {title}
          </p>
          <p className='text-sm leading-6 text-primary-token/70'>{body}</p>
        </div>
      </div>
      <span
        className={cn(
          profilePrimaryPillClassName,
          'mt-4 self-start border-transparent'
        )}
      >
        {actionLabel}
      </span>
    </button>
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
  previewActionLabel = 'Listen',
  onPlayClick,
  onOpenAlerts,
  viewerLocation,
  resolveNearbyTour = true,
  isSubscribed = false,
  previewNotificationsState,
}: Readonly<ProfileHomeRailProps>) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const upcomingTourDates = useMemo(
    () => getUpcomingProfileTourDates(tourDates),
    [tourDates]
  );
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
        hasAlertsCard: true,
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

      const nextIndex = cardElements.reduce(
        (best, element, index) => {
          const distance = Math.abs(element.offsetLeft - container.scrollLeft);
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
    <div className='space-y-3'>
      <div
        ref={railRef}
        className='-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        data-testid='profile-home-rail'
      >
        {cards.map((card, index) => (
          <div
            key={card.id}
            className='min-w-[calc(100%-56px)] snap-start sm:min-w-[calc(100%-72px)]'
            data-rail-card-index={index}
          >
            {card.kind === 'alerts' ? (
              <AlertsRailCard
                isSubscribed={isSubscribed}
                onOpenAlerts={onOpenAlerts}
                renderMode={renderMode}
                previewNotificationsState={previewNotificationsState}
              />
            ) : (
              <ProfilePrimaryActionCard
                artist={artist}
                latestRelease={card.kind === 'release' ? latestRelease : null}
                profileSettings={
                  card.kind === 'release' ? profileSettings : null
                }
                featuredPlaylistFallback={
                  card.kind === 'playlist' ? featuredPlaylistFallback : null
                }
                tourDates={card.kind === 'tour' ? tourDates : []}
                hasPlayableDestinations={card.kind === 'listen'}
                renderMode={renderMode}
                previewActionLabel={
                  card.kind === 'listen' ? 'Listen' : previewActionLabel
                }
                onPlayClick={onPlayClick}
                viewerLocation={viewerLocation}
                resolveNearbyTour={card.kind === 'tour' && resolveNearbyTour}
                dataTestId={`profile-home-rail-${card.kind}`}
                size='showcase'
              />
            )}
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
                  ? 'w-6 bg-[color:var(--profile-rail-dot-active)]'
                  : 'w-2.5 bg-[color:var(--profile-rail-dot-inactive)]'
              )}
              aria-label={`View rail card ${index + 1}`}
            />
          ))}
        </div>
      ) : null}

      {featuredState.kind === 'release_countdown' && latestRelease ? (
        <p className='px-1 text-xs font-medium tracking-[-0.01em] text-primary-token/58'>
          Release spotlight: {latestRelease.title} drops{' '}
          {formatProfileDateLabel(latestRelease.releaseDate)}
        </p>
      ) : null}
    </div>
  );
}
