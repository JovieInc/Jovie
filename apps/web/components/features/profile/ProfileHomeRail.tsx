'use client';

import { Bell } from 'lucide-react';
import { useMemo } from 'react';
import type { ProfileRenderMode } from '@/features/profile/contracts';
import {
  ProfilePrimaryActionCard,
  type ProfilePrimaryActionCardRelease,
  resolveProfilePrimaryActionCardState,
} from '@/features/profile/ProfilePrimaryActionCard';
import {
  startOfProfileSurfaceLocalDay as startOfLocalDay,
  toProfileSurfaceDateValue as toDateValue,
} from '@/features/profile/profile-surface-state';
import { useReleaseAwareNow } from '@/hooks/useReleaseAwareNow';
import { useTourDateProximity } from '@/hooks/useTourDateProximity';
import type { UserLocation } from '@/hooks/useUserLocation';
import { useUserLocation } from '@/hooks/useUserLocation';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
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
  readonly onAlertsClick?: () => void;
  readonly isSubscribed?: boolean;
  readonly viewerLocation?: UserLocation | null;
  readonly resolveNearbyTour?: boolean;
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

function HomeAlertsCard({
  artist,
  isSubscribed,
  onAlertsClick,
  renderMode,
  variant,
}: Readonly<{
  artist: Artist;
  isSubscribed: boolean;
  onAlertsClick?: () => void;
  renderMode: ProfileRenderMode;
  variant: 'row' | 'bento';
}>) {
  const title = isSubscribed ? 'Alerts On' : `Get ${artist.name} alerts`;
  const description = isSubscribed
    ? 'New music, shows, and merch updates are ready.'
    : 'New music, shows, and merch in one tap.';
  const isInteractive = renderMode === 'interactive' && onAlertsClick;
  const sharedProps = {
    className:
      variant === 'bento'
        ? 'group grid min-h-[104px] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-[18px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] px-4 py-4 text-left text-white shadow-[0_18px_44px_-26px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl transition-[background-color,border-color,opacity] duration-subtle hover:bg-white/[0.07] active:opacity-[0.9]'
        : 'group flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.035] px-3 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_28px_-18px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-[background-color,border-color,opacity] duration-subtle hover:bg-white/[0.055] active:opacity-[0.9]',
    role: 'switch',
    'aria-checked': isSubscribed,
    'aria-label': isSubscribed
      ? `Manage alerts for ${artist.name}`
      : `Get alerts for ${artist.name}`,
    'data-testid':
      variant === 'bento'
        ? 'profile-home-alerts-fallback-card'
        : 'profile-home-alerts-row',
  } as const;
  const iconClassName =
    variant === 'bento'
      ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-white/8 bg-white/[0.06] text-white'
      : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/8 bg-white/[0.045] text-white';
  const content = (
    <>
      <span className={iconClassName} aria-hidden='true'>
        <Bell className={variant === 'bento' ? 'h-5 w-5' : 'h-4 w-4'} />
      </span>
      <span className='min-w-0 flex-1'>
        <span
          className={
            variant === 'bento'
              ? 'block text-[16px] font-[650] leading-5 tracking-[-0.025em] [overflow-wrap:anywhere]'
              : 'block text-[13px] font-semibold leading-5 tracking-[-0.01em] [overflow-wrap:anywhere]'
          }
        >
          {title}
        </span>
        <span
          className={
            variant === 'bento'
              ? 'mt-1 block max-w-[26ch] text-[12.5px] leading-5 text-white/56 [overflow-wrap:anywhere]'
              : 'block text-[11.5px] leading-4 text-white/52 [overflow-wrap:anywhere]'
          }
        >
          {description}
        </span>
      </span>
      <span
        className={
          isSubscribed
            ? 'relative h-[26px] w-[42px] shrink-0 rounded-full border border-white/42 bg-white p-0.5 transition-colors duration-subtle'
            : 'relative h-[26px] w-[42px] shrink-0 rounded-full border border-white/16 bg-white/10 p-0.5 transition-colors duration-subtle'
        }
        aria-hidden='true'
      >
        <span
          className={
            isSubscribed
              ? 'block h-[22px] w-[22px] translate-x-4 rounded-full bg-black shadow-[0_4px_10px_rgba(0,0,0,0.22)] transition-transform duration-subtle'
              : 'block h-[22px] w-[22px] translate-x-0 rounded-full bg-white shadow-[0_4px_10px_rgba(0,0,0,0.22)] transition-transform duration-subtle'
          }
        />
      </span>
    </>
  );

  if (isInteractive) {
    return (
      <button type='button' onClick={onAlertsClick} {...sharedProps}>
        {content}
      </button>
    );
  }

  return <div {...sharedProps}>{content}</div>;
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
  onAlertsClick,
  isSubscribed = false,
  viewerLocation,
  resolveNearbyTour = true,
}: Readonly<ProfileHomeRailProps>) {
  // Re-evaluate visibility at the release boundary so the rail's "Drops in"
  // chrome transitions to "Out Now" when the release drops, even if the
  // page was served from a stale ISR cache.
  const now = useReleaseAwareNow(latestRelease?.releaseDate);
  const upcomingTourDates = useMemo(
    () => getUpcomingTourDates(tourDates, now),
    [now, tourDates]
  );
  const releaseVisibility = useMemo(
    () => getProfileReleaseVisibility(latestRelease, profileSettings, now),
    [latestRelease, now, profileSettings]
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

  const hasPrimaryFeature =
    featuredState.kind === 'release_countdown' ||
    featuredState.kind === 'release_live' ||
    featuredState.kind === 'tour_nearby' ||
    featuredState.kind === 'tour_next' ||
    featuredState.kind === 'playlist_fallback';

  const alertsCard = (
    <HomeAlertsCard
      artist={artist}
      isSubscribed={isSubscribed}
      onAlertsClick={onAlertsClick}
      renderMode={renderMode}
      variant={hasPrimaryFeature ? 'row' : 'bento'}
    />
  );

  const featureCard = hasPrimaryFeature ? (
    <ProfilePrimaryActionCard
      artist={artist}
      latestRelease={latestRelease}
      profileSettings={profileSettings}
      featuredPlaylistFallback={featuredPlaylistFallback}
      tourDates={tourDates}
      hasPlayableDestinations={hasPlayableDestinations}
      renderMode={renderMode}
      previewActionLabel={previewActionLabel}
      onPlayClick={onPlayClick}
      viewerLocation={viewerLocation}
      resolveNearbyTour={resolveNearbyTour}
      size='showcase'
      dataTestId='profile-home-primary-action-card'
      className='w-full'
      now={now}
    />
  ) : null;

  return (
    <div
      className='min-w-0 space-y-2 md:mx-auto md:w-full md:max-w-[320px]'
      data-testid='profile-home-rail'
      data-feature-state={featuredState.kind}
    >
      {alertsCard}
      {featureCard ? (
        <div className='min-w-0' data-testid='profile-home-feature-card'>
          {featureCard}
        </div>
      ) : null}
    </div>
  );
}
