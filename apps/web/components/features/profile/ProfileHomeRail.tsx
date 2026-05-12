'use client';

import { useMemo } from 'react';
import type { ProfileRenderMode } from '@/features/profile/contracts';
import { ProfileMediaCard } from '@/features/profile/ProfileMediaCard';
import {
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
import { isDefaultAvatarUrl } from '@/lib/utils/dsp-images';
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
  if (!date) return 'Soon';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function formatDayLabel(value: string | null | undefined) {
  const date = toDateValue(value);
  if (!date) return '--';

  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function formatWeekdayTimeLabel(tourDate: TourDateViewModel) {
  const date = toDateValue(tourDate.startDate);
  const weekday = date
    ? new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(date)
    : null;

  return [weekday, tourDate.startTime].filter(Boolean).join(' · ');
}

function formatTourLocation(tourDate: TourDateViewModel) {
  return [tourDate.city, tourDate.region].filter(Boolean).join(', ');
}

function formatReleaseType(value: string | null | undefined) {
  if (!value) return 'Release';
  return capitalizeFirst(value.replaceAll('_', ' '));
}

function resolveImageUrl(
  imageUrl: string | null | undefined,
  fallbackVariant: 'release' | 'avatar'
) {
  if (fallbackVariant === 'avatar' && isDefaultAvatarUrl(imageUrl)) {
    return null;
  }

  return imageUrl ?? null;
}

function getReleaseCardMeta(release: ProfilePrimaryActionCardRelease) {
  const type = formatReleaseType(release.releaseType);
  return release.releaseType === 'ep' ? 'EP' : type;
}

function LatestReleaseFeature({
  artist,
  latestRelease,
  isCountdown,
  onPlayClick,
  renderMode,
}: Readonly<{
  artist: Artist;
  latestRelease: ProfilePrimaryActionCardRelease;
  isCountdown: boolean;
  onPlayClick?: () => void;
  renderMode: ProfileRenderMode;
}>) {
  const releaseDate = toDateValue(latestRelease.releaseDate);
  const liveAction =
    renderMode === 'interactive' && onPlayClick
      ? { label: 'Listen Now', onClick: onPlayClick, icon: 'Play' as const }
      : {
          label: 'Listen Now',
          href: `/${artist.handle}/${latestRelease.slug}`,
          icon: 'Play' as const,
        };

  return (
    <ProfileMediaCard
      eyebrow={isCountdown ? 'New Single' : 'New Release'}
      title={latestRelease.title}
      subtitle={getReleaseCardMeta(latestRelease)}
      imageUrl={resolveImageUrl(latestRelease.artworkUrl, 'release')}
      imageAlt={`${latestRelease.title} artwork`}
      fallbackVariant='release'
      accent='purple'
      ratio='landscape'
      countdown={
        isCountdown && releaseDate
          ? { targetDate: releaseDate, label: 'Drops in' }
          : null
      }
      status={isCountdown ? null : { label: 'Out Now', tone: 'green' }}
      action={
        isCountdown
          ? {
              label: 'Notify me',
              href: `/${artist.handle}/${latestRelease.slug}`,
              icon: 'Bell',
            }
          : liveAction
      }
      priority
      dataTestId='profile-home-latest-card'
      className='rounded-[18px] [&>div:first-child]:aspect-[3/1] [@media(max-height:880px)]:[&>div:last-child]:px-2.5 [@media(max-height:880px)]:[&>div:last-child]:py-2'
    />
  );
}

function TourFeatureCard({
  artist,
  tourDate,
  isNearYou,
}: Readonly<{
  artist: Artist;
  tourDate: TourDateViewModel;
  isNearYou: boolean;
}>) {
  const canBuyTickets =
    Boolean(tourDate.ticketUrl) &&
    tourDate.ticketStatus !== 'cancelled' &&
    tourDate.ticketStatus !== 'sold_out';

  return (
    <ProfileMediaCard
      eyebrow={isNearYou ? 'Near You' : 'Next Show'}
      title={tourDate.title ?? `${artist.name} Live`}
      subtitle={tourDate.venueName}
      locationLabel={formatTourLocation(tourDate)}
      imageUrl={resolveImageUrl(artist.image_url, 'avatar')}
      imageAlt={`${artist.name} show`}
      fallbackVariant='avatar'
      accent={isNearYou ? 'blue' : 'orange'}
      ratio='landscape'
      datePill={{
        month: formatMonthLabel(tourDate.startDate),
        day: formatDayLabel(tourDate.startDate),
        meta: formatWeekdayTimeLabel(tourDate),
      }}
      action={{
        label:
          tourDate.ticketStatus === 'sold_out'
            ? 'Sold out'
            : tourDate.ticketStatus === 'cancelled'
              ? 'Cancelled'
              : canBuyTickets
                ? 'Get tickets'
                : 'Details',
        href: canBuyTickets ? tourDate.ticketUrl : `/${artist.handle}/tour`,
        icon: 'Ticket',
        showChevron: canBuyTickets,
        disabled: tourDate.ticketStatus === 'cancelled',
      }}
      priority
      dataTestId='profile-home-rail-tour'
      className='rounded-[18px] [&>div:first-child]:aspect-[3/1] [@media(max-height:880px)]:[&>div:last-child]:px-2.5 [@media(max-height:880px)]:[&>div:last-child]:py-2'
    />
  );
}

function PlaylistFeatureCard({
  playlist,
}: Readonly<{ playlist: ConfirmedFeaturedPlaylistFallback }>) {
  return (
    <ProfileMediaCard
      eyebrow='Featured Playlist'
      title={playlist.title}
      subtitle='Open playlist'
      imageUrl={playlist.imageUrl}
      imageAlt={playlist.title}
      fallbackVariant='release'
      accent='green'
      ratio='landscape'
      action={{
        label: 'Listen',
        ariaLabel: `Open ${playlist.title}`,
        href: playlist.url,
        icon: 'Play',
        showChevron: true,
      }}
      priority
      dataTestId='profile-home-rail-playlist'
      className='rounded-[18px] [&>div:first-child]:aspect-[3/1] [@media(max-height:880px)]:[&>div:last-child]:px-2.5 [@media(max-height:880px)]:[&>div:last-child]:py-2'
    />
  );
}

function ListenFeatureCard({
  artist,
  onPlayClick,
}: Readonly<{
  artist: Artist;
  onPlayClick?: () => void;
}>) {
  return (
    <ProfileMediaCard
      eyebrow='Music'
      title={artist.name}
      subtitle='Choose a platform'
      imageUrl={resolveImageUrl(artist.image_url, 'avatar')}
      imageAlt={artist.name}
      fallbackVariant='avatar'
      accent='purple'
      ratio='landscape'
      action={{
        label: 'Listen',
        ariaLabel: `Listen to ${artist.name}`,
        href: onPlayClick ? null : `/${artist.handle}?mode=listen`,
        onClick: onPlayClick,
        icon: 'Play',
      }}
      priority
      dataTestId='profile-home-rail-listen'
      className='rounded-[18px] [&>div:first-child]:aspect-[3/1] [@media(max-height:880px)]:[&>div:last-child]:px-2.5 [@media(max-height:880px)]:[&>div:last-child]:py-2'
    />
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

  const isCountdown = featuredState.kind === 'release_countdown';
  const showLatest = Boolean(releaseVisibility?.show && latestRelease);
  const visibleTourDate = nearbyTourDate ?? nextTourDate;

  let featureCard: React.ReactNode = null;
  if (showLatest && latestRelease) {
    featureCard = (
      <LatestReleaseFeature
        artist={artist}
        latestRelease={latestRelease}
        isCountdown={isCountdown}
        onPlayClick={onPlayClick}
        renderMode={renderMode}
      />
    );
  } else if (
    visibleTourDate &&
    (featuredState.kind === 'tour_nearby' || featuredState.kind === 'tour_next')
  ) {
    featureCard = (
      <TourFeatureCard
        artist={artist}
        tourDate={visibleTourDate}
        isNearYou={Boolean(nearbyTourDate && resolveNearbyTour)}
      />
    );
  } else if (
    featuredState.kind === 'playlist_fallback' &&
    featuredPlaylistFallback
  ) {
    featureCard = <PlaylistFeatureCard playlist={featuredPlaylistFallback} />;
  } else if (featuredState.kind === 'listen_fallback') {
    featureCard = (
      <ListenFeatureCard artist={artist} onPlayClick={onPlayClick} />
    );
  }

  if (!featureCard) {
    return null;
  }

  return <div data-testid='profile-home-rail'>{featureCard}</div>;
}
