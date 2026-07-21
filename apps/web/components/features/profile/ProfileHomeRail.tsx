'use client';

import { Bell } from 'lucide-react';
import { type MouseEvent, useMemo } from 'react';
import {
  type EntityCardModel,
  merchToEntityCard,
  releaseToEntityCard,
  showToEntityCard,
} from '@/components/organisms/entity-card';
import type { NotificationSourceContext } from '@/features/profile/artist-notifications-cta/types';
import type { ProfileRenderMode } from '@/features/profile/contracts';
import { ProfileEmptyBentoCard } from '@/features/profile/ProfileEmptyBentoCard';
import type { ProfilePrimaryActionCardRelease } from '@/features/profile/ProfilePrimaryActionCard';
import {
  startOfProfileSurfaceLocalDay as startOfLocalDay,
  toProfileSurfaceDateValue as toDateValue,
} from '@/features/profile/profile-surface-state';
import { useReleaseAwareNow } from '@/hooks/useReleaseAwareNow';
import { useTourDateProximity } from '@/hooks/useTourDateProximity';
import type { UserLocation } from '@/hooks/useUserLocation';
import { useUserLocation } from '@/hooks/useUserLocation';
import {
  DEFAULT_PROFILE_PAC_ASSIGNMENT,
  type ProfilePacAssignment,
  type ProfilePacS2Slot,
} from '@/lib/flags/profile-pac';
import type { PublicMerchCard } from '@/lib/merch/types';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist } from '@/types/db';
import { ProfilePacCard, type ProfilePacRelease } from './pac/ProfilePacCard';
import { ReleaseCatalogCarousel } from './ReleaseCatalogCarousel';
import type { PublicRelease } from './releases/types';
import { usePacEvents } from './usePacEvents';

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
  readonly profilePacAssignment?: ProfilePacAssignment;
  readonly viewerLocation?: UserLocation | null;
  readonly resolveNearbyTour?: boolean;
  readonly merchCards?: readonly PublicMerchCard[];
  readonly releases?: readonly PublicRelease[];
  readonly hasTip?: boolean;
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

function HomeAlertsSwitch() {
  return (
    <span
      className='relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-white/18 bg-white/18 p-1 shadow-sm transition-colors duration-subtle group-hover:bg-white/24'
      aria-hidden='true'
      data-testid='profile-home-alerts-switch'
    >
      <span className='block h-6 w-6 rounded-full bg-white shadow-[0_3px_10px_rgba(0,0,0,0.32)] dark:bg-white' />
    </span>
  );
}

function HomeAlertsCard({
  artist,
  onAlertsClick,
  renderMode,
  prominent,
  sourceContext,
}: Readonly<{
  artist: Artist;
  onAlertsClick?: (context: NotificationSourceContext) => void;
  renderMode: ProfileRenderMode;
  prominent: boolean;
  sourceContext: NotificationSourceContext;
}>) {
  const title = 'Alerts';
  const description = `${artist.name}: music, shows, merch.`;
  const isInteractive = renderMode === 'interactive';
  const subscribeHref = `/${artist.handle}?mode=subscribe`;
  const ariaLabel = `Turn on alerts for ${artist.name}`;
  const handleClick = isInteractive
    ? (event: MouseEvent<HTMLElement>) => {
        if (!onAlertsClick) {
          return;
        }
        event.preventDefault();
        onAlertsClick(sourceContext);
      }
    : undefined;

  return (
    <ProfileEmptyBentoCard
      accent='alerts'
      icon={Bell}
      title={title}
      body={description}
      layout={prominent ? 'prominent' : 'inline'}
      trailing={<HomeAlertsSwitch />}
      href={isInteractive ? subscribeHref : undefined}
      onClick={handleClick}
      ariaLabel={ariaLabel}
      dataTestId='profile-home-alerts-fallback-card'
    />
  );
}

function getS2OrderedItems({
  assignedSlot,
  merchItems,
  showItems,
}: Readonly<{
  assignedSlot: ProfilePacS2Slot;
  merchItems: readonly EntityCardModel[];
  showItems: readonly EntityCardModel[];
}>) {
  const slotBuckets: Record<ProfilePacS2Slot, readonly EntityCardModel[]> = {
    merch: merchItems,
    tip: [],
    tickets: showItems,
    rsvp: showItems,
  };
  const preferredItems = slotBuckets[assignedSlot];
  const fallbackItems =
    assignedSlot === 'tickets' || assignedSlot === 'rsvp'
      ? merchItems
      : showItems;

  return preferredItems.length > 0
    ? [...preferredItems, ...fallbackItems]
    : [...merchItems, ...showItems];
}

export const __profileHomeRailTestUtils = {
  getS2OrderedItems,
};

export function ProfileHomeRail({
  artist,
  latestRelease,
  profileSettings,
  featuredPlaylistFallback,
  tourDates = [],
  renderMode = 'interactive',
  onAlertsClick,
  isSubscribed = false,
  profilePacAssignment = DEFAULT_PROFILE_PAC_ASSIGNMENT,
  viewerLocation,
  resolveNearbyTour = true,
  merchCards = [],
  releases = [],
  hasTip = false,
}: Readonly<ProfileHomeRailProps>) {
  // PAC instrumentation (spec §8): pac_exposure fires when the rail is ≥50%
  // visible, once per state per session, keyed to the visitor's variant.
  const { exposureRef } = usePacEvents({
    profileId: artist.id,
    assignment: profilePacAssignment,
    enabled: renderMode !== 'preview',
  });
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
  const nearbyTourDateId = nearbyDates[0]?.date?.id ?? null;

  // One ordered card list — featured item first, then the rest. No stacked
  // sections: a single carousel is the profile home surface.
  const carouselItems = useMemo<EntityCardModel[]>(() => {
    const featuredItems: EntityCardModel[] = [];
    const releaseItems: EntityCardModel[] = [];
    const merchItems: EntityCardModel[] = [];
    const showItems: EntityCardModel[] = [];

    // Featured: the latest release when it's visible per profile settings.
    const hasFeaturedRelease = Boolean(
      releaseVisibility?.show && latestRelease
    );
    const featuredReleaseSlug =
      hasFeaturedRelease && latestRelease ? latestRelease.slug : null;
    const featuredReleaseId =
      featuredReleaseSlug === null
        ? null
        : (releases.find(release => release.slug === featuredReleaseSlug)?.id ??
          null);

    if (hasFeaturedRelease && latestRelease) {
      featuredItems.push(
        releaseToEntityCard(
          {
            id: featuredReleaseId ?? undefined,
            title: latestRelease.title,
            slug: latestRelease.slug,
            artworkUrl: latestRelease.artworkUrl,
            releaseDate: latestRelease.releaseDate,
            releaseType: latestRelease.releaseType,
          },
          { handle: artist.handle, now }
        )
      );
    } else if (upcomingTourDates.length === 0 && featuredPlaylistFallback) {
      // Fallback feature when there's no release or upcoming show: the
      // artist's confirmed "This Is" playlist, as a music card.
      featuredItems.push({
        id: `playlist-${featuredPlaylistFallback.playlistId}`,
        kind: 'music',
        href: featuredPlaylistFallback.url,
        imageUrl: featuredPlaylistFallback.imageUrl,
        imageAlt: featuredPlaylistFallback.title,
        accent: 'green',
        eyebrow: 'Playlist',
        title: featuredPlaylistFallback.title,
        cta: {
          label: 'Open Playlist',
          href: featuredPlaylistFallback.url,
          external: true,
        },
      });
    }

    // Back catalog: include non-featured releases in the same carousel.
    for (const release of releases) {
      if (release.slug === '' || release.slug === featuredReleaseSlug) {
        continue;
      }
      releaseItems.push(
        releaseToEntityCard(release, { handle: artist.handle, now })
      );
    }

    // Shoppable merch (revenue) next.
    for (const card of merchCards) {
      merchItems.push(merchToEntityCard(card, { handle: artist.handle }));
    }

    // Upcoming shows, nearest-to-viewer first when geo resolved.
    const shows = [...upcomingTourDates].sort((a, b) =>
      a.id === nearbyTourDateId ? -1 : b.id === nearbyTourDateId ? 1 : 0
    );
    for (const show of shows) {
      showItems.push(
        showToEntityCard({
          id: show.id,
          title: show.title,
          venueName: show.venueName,
          city: show.city,
          startDate: show.startDate,
          ticketUrl: show.ticketUrl,
        })
      );
    }

    return [
      ...featuredItems,
      ...getS2OrderedItems({
        assignedSlot: profilePacAssignment.s2Slot,
        merchItems,
        showItems,
      }),
      ...releaseItems,
    ];
  }, [
    artist.handle,
    featuredPlaylistFallback,
    latestRelease,
    merchCards,
    nearbyTourDateId,
    now,
    profilePacAssignment.s2Slot,
    releases,
    releaseVisibility?.show,
    upcomingTourDates,
  ]);

  const isLowContentHome = carouselItems.length === 0;

  // Primary Action Card subject: the visible latest release (preferred) or
  // the newest catalog release. Preview URL comes from the lite releases
  // payload; when absent the PAC degrades to a link-out (no inline play).
  const pacRelease = useMemo<ProfilePacRelease | null>(() => {
    if (releaseVisibility?.show && latestRelease) {
      const catalogMatch = releases.find(
        release => release.slug === latestRelease.slug
      );
      return {
        title: latestRelease.title,
        slug: latestRelease.slug,
        artworkUrl: latestRelease.artworkUrl,
        previewUrl: catalogMatch?.previewUrl ?? null,
      };
    }
    const newest = releases.find(release => release.slug !== '');
    if (!newest) return null;
    return {
      title: newest.title,
      slug: newest.slug,
      artworkUrl: newest.artworkUrl,
      previewUrl: newest.previewUrl ?? null,
    };
  }, [latestRelease, releases, releaseVisibility?.show]);

  const pacNextShow =
    upcomingTourDates.find(show => show.id === nearbyTourDateId) ??
    upcomingTourDates[0] ??
    null;

  const alertsCard = isSubscribed ? null : (
    <HomeAlertsCard
      artist={artist}
      onAlertsClick={onAlertsClick}
      renderMode={renderMode}
      prominent={isLowContentHome}
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

  return (
    <div
      ref={exposureRef}
      className='min-w-0 space-y-2 md:mx-auto md:w-full md:max-w-80'
      data-testid='profile-home-rail'
    >
      <ProfilePacCard
        artist={artist}
        release={pacRelease}
        merchCard={merchCards[0] ?? null}
        nextShow={pacNextShow}
        hasTip={hasTip}
        assignment={profilePacAssignment}
        isSubscribed={isSubscribed}
        renderMode={renderMode}
      />
      {alertsCard}
      <ReleaseCatalogCarousel
        items={carouselItems}
        artistHandle={artist.handle}
        artistId={artist.id}
        analyticsEnabled={renderMode !== 'preview'}
      />
    </div>
  );
}
