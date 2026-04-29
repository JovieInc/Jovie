'use client';

import { useMemo } from 'react';
import type { ProfileRenderMode } from '@/features/profile/contracts';
import { ProfileMediaCard } from '@/features/profile/ProfileMediaCard';
import {
  type ProfilePrimaryActionCardRelease,
  resolveProfilePrimaryActionCardState,
} from '@/features/profile/ProfilePrimaryActionCard';
import {
  buildProfileSmartCards,
  startOfProfileSurfaceLocalDay as startOfLocalDay,
  toProfileSurfaceDateValue as toDateValue,
} from '@/features/profile/profile-surface-state';
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

export { buildProfileSmartCards as buildProfileRailCards };

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

function TourUpNextCard({
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
      ratio='compact'
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
      dataTestId='profile-home-rail-tour'
      className='[@media(max-height:880px)]:[&>div:first-child]:aspect-[1.35/1] [@media(max-height:880px)]:[&>div:last-child]:p-1'
    />
  );
}

function PlaylistUpNextCard({
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
      ratio='compact'
      action={{
        label: 'Listen',
        ariaLabel: `Open ${playlist.title}`,
        href: playlist.url,
        icon: 'Play',
        showChevron: true,
      }}
      dataTestId='profile-home-rail-playlist'
      className='[@media(max-height:880px)]:[&>div:first-child]:aspect-[1.35/1] [@media(max-height:880px)]:[&>div:last-child]:p-1'
    />
  );
}

function ListenUpNextCard({
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
      ratio='compact'
      action={{
        label: 'Listen',
        ariaLabel: `Listen to ${artist.name}`,
        href: onPlayClick ? null : `/${artist.handle}?mode=listen`,
        onClick: onPlayClick,
        icon: 'Play',
      }}
      dataTestId='profile-home-rail-listen'
      className='[@media(max-height:880px)]:[&>div:first-child]:aspect-[1.35/1] [@media(max-height:880px)]:[&>div:last-child]:p-1'
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
  onPlayClick,
  viewerLocation,
  resolveNearbyTour = true,
}: Readonly<ProfileHomeRailProps>) {
  const upcomingTourDates = useMemo(
    () => getUpcomingTourDates(tourDates),
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
      buildProfileSmartCards({
        latestReleaseVisible: Boolean(releaseVisibility?.show && latestRelease),
        hasUpcomingTourDates: upcomingTourDates.length > 0,
        hasPlaylistFallback: Boolean(featuredPlaylistFallback),
        hasListenFallback: hasPlayableDestinations,
      }),
    [
      featuredPlaylistFallback,
      hasPlayableDestinations,
      latestRelease,
      releaseVisibility?.show,
      upcomingTourDates.length,
    ]
  );

  if (cards.length === 0) {
    return null;
  }

  const visibleTourDate = nearbyTourDate ?? nextTourDate;

  return (
    <div
      className='space-y-2 [@media(max-height:820px)]:space-y-1.5'
      data-testid='profile-home-rail'
    >
      <p className='text-[12px] font-[680] text-white/76 [@media(max-height:760px)]:text-[10px]'>
        Latest
      </p>
      <div className='-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [@media(max-height:820px)]:gap-1.5 [&::-webkit-scrollbar]:hidden'>
        {cards.map(card => (
          <div
            key={card.id}
            className='w-[136px] shrink-0 snap-start [@media(max-height:820px)]:w-[112px] [@media(max-height:760px)]:w-[104px]'
            data-rail-card-index={card.id}
          >
            {card.kind === 'release' && latestRelease ? (
              <ProfileMediaCard
                eyebrow={
                  featuredState.kind === 'release_countdown'
                    ? 'New Single'
                    : 'New Release'
                }
                title={latestRelease.title}
                subtitle={getReleaseCardMeta(latestRelease)}
                imageUrl={resolveImageUrl(latestRelease.artworkUrl, 'release')}
                imageAlt={`${latestRelease.title} artwork`}
                fallbackVariant='release'
                accent='purple'
                ratio='compact'
                countdown={
                  featuredState.kind === 'release_countdown' &&
                  latestRelease.releaseDate
                    ? {
                        targetDate: latestRelease.releaseDate,
                        label: 'Drops in',
                      }
                    : null
                }
                action={{
                  label:
                    featuredState.kind === 'release_countdown'
                      ? 'Notify me'
                      : 'Listen',
                  ariaLabel: `Open ${latestRelease.title}`,
                  href: `/${artist.handle}/${latestRelease.slug}`,
                  icon:
                    featuredState.kind === 'release_countdown'
                      ? 'Bell'
                      : 'Play',
                }}
                dataTestId='profile-home-rail-release'
                className='[@media(max-height:880px)]:[&>div:first-child]:aspect-[1.35/1] [@media(max-height:880px)]:[&>div:last-child]:p-1'
              />
            ) : null}

            {card.kind === 'tour' && visibleTourDate ? (
              <TourUpNextCard
                artist={artist}
                tourDate={visibleTourDate}
                isNearYou={Boolean(nearbyTourDate && resolveNearbyTour)}
              />
            ) : null}

            {card.kind === 'playlist' && featuredPlaylistFallback ? (
              <PlaylistUpNextCard playlist={featuredPlaylistFallback} />
            ) : null}

            {card.kind === 'listen' ? (
              <ListenUpNextCard artist={artist} onPlayClick={onPlayClick} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
