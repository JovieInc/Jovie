'use client';

import { Bell } from 'lucide-react';
import { useMemo } from 'react';
import type { NotificationSourceContext } from '@/features/profile/artist-notifications-cta/types';
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
  readonly onAlertsClick?: (context: NotificationSourceContext) => void;
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
  onAlertsClick,
  renderMode,
  variant,
  sourceContext,
}: Readonly<{
  artist: Artist;
  onAlertsClick?: (context: NotificationSourceContext) => void;
  renderMode: ProfileRenderMode;
  variant: 'row' | 'bento';
  sourceContext: NotificationSourceContext;
}>) {
  const title = 'Alerts';
  const description = `${artist.name}: music, shows, merch.`;
  const isInteractive = renderMode === 'interactive';
  const subscribeHref = `/${artist.handle}?mode=subscribe`;
  const sharedProps = {
    className:
      variant === 'bento'
        ? 'group flex min-h-[70px] w-full min-w-0 items-center gap-3 rounded-[var(--profile-inner-radius)] border border-white/10 bg-white/[0.045] px-3.5 py-3 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_28px_-22px_rgba(0,0,0,0.62)] backdrop-blur-2xl transition-[background-color,border-color,opacity] duration-subtle hover:bg-white/[0.06] active:opacity-[0.9]'
        : 'group flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/[0.035] px-3 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_28px_-18px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-[background-color,border-color,opacity] duration-subtle hover:bg-white/[0.055] active:opacity-[0.9]',
    'data-testid':
      variant === 'bento'
        ? 'profile-home-alerts-fallback-card'
        : 'profile-home-alerts-row',
  } as const;
  const ariaLabel = `Turn on alerts for ${artist.name}`;
  const iconClassName =
    variant === 'bento'
      ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-white/8 bg-white/[0.055] text-white/88'
      : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/8 bg-white/[0.045] text-white/86';
  const content = (
    <>
      <span className={iconClassName} aria-hidden='true'>
        <Bell className={variant === 'bento' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      </span>
      <span className='min-w-0 flex-1'>
        <span
          className={
            variant === 'bento'
              ? 'block text-[13px] font-semibold leading-[1.15] [overflow-wrap:anywhere]'
              : 'block text-[12.5px] font-semibold leading-4 [overflow-wrap:anywhere]'
          }
        >
          {title}
        </span>
        <span
          className={
            variant === 'bento'
              ? 'mt-0.5 block max-w-[25ch] text-[11.5px] leading-4 text-white/54 [overflow-wrap:anywhere]'
              : 'mt-0.5 block text-[11px] leading-3.5 text-white/50 [overflow-wrap:anywhere]'
          }
        >
          {description}
        </span>
      </span>
      <span
        className='relative inline-flex h-[28px] w-[48px] shrink-0 items-center rounded-full border border-white/12 bg-white/[0.16] p-[3px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] transition-[background-color,border-color,opacity] duration-subtle group-hover:bg-white/[0.2]'
        aria-hidden='true'
        data-testid='profile-home-alerts-switch'
      >
        <span className='block h-[22px] w-[22px] rounded-full bg-white shadow-[0_3px_10px_rgba(0,0,0,0.32)]' />
      </span>
    </>
  );

  if (isInteractive) {
    return (
      <a
        href={subscribeHref}
        onClick={event => {
          if (!onAlertsClick) {
            return;
          }
          event.preventDefault();
          onAlertsClick(sourceContext);
        }}
        aria-label={ariaLabel}
        {...sharedProps}
      >
        {content}
      </a>
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

  const alertsCard = isSubscribed ? null : (
    <HomeAlertsCard
      artist={artist}
      onAlertsClick={onAlertsClick}
      renderMode={renderMode}
      variant={hasPrimaryFeature ? 'row' : 'bento'}
      sourceContext={{
        artistId: artist.id,
        profileId: artist.id,
        profileSlug: artist.handle,
        currentTab: 'home',
        ctaLocation: 'home_alerts_card',
        intent: 'general_alerts',
      }}
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
      size={
        featuredState.kind === 'release_countdown' ||
        featuredState.kind === 'release_live'
          ? 'showcase'
          : 'compact'
      }
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
