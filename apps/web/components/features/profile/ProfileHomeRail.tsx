'use client';

import { type MouseEvent, memo, useMemo } from 'react';
import {
  EntityCard,
  type EntityCardModel,
  merchToEntityCard,
  releaseToEntityCard,
  showToEntityCard,
} from '@/components/organisms/entity-card';
import type { NotificationSourceContext } from '@/features/profile/artist-notifications-cta/types';
import type { ProfileRenderMode } from '@/features/profile/contracts';
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
  /**
   * Set when the profile has no hero photo: the PAC card's artwork becomes
   * the LCP image, so it must load with priority instead of lazy.
   */
  readonly pacArtPriority?: boolean;
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
  sourceContext,
}: Readonly<{
  artist: Artist;
  onAlertsClick?: (context: NotificationSourceContext) => void;
  renderMode: ProfileRenderMode;
  sourceContext: NotificationSourceContext;
}>) {
  const isInteractive = renderMode === 'interactive';
  const subscribeHref = `/${artist.handle}?mode=subscribe`;
  const handleClick = isInteractive
    ? (event: MouseEvent<HTMLElement>) => {
        if (!onAlertsClick) {
          return;
        }
        event.preventDefault();
        onAlertsClick(sourceContext);
      }
    : undefined;

  // The alerts card is a standard unified-anatomy card — icon art zone,
  // context eyebrow, "Alerts" title, one-line body, full-width CTA — the
  // same design as every other card in the home carousel.
  const model: EntityCardModel = {
    id: `alerts-${artist.id}`,
    kind: 'alerts',
    href: isInteractive ? subscribeHref : null,
    imageUrl: null,
    imageAlt: `Alerts for ${artist.name}`,
    eyebrow: artist.name,
    title: 'Alerts',
    meta: 'Music, shows, merch — first.',
    cta: {
      label: 'Get Updates',
      href: isInteractive ? subscribeHref : null,
    },
  };

  return (
    <EntityCard
      model={model}
      treatment='detailed'
      surface='pearl'
      anatomy='unified'
      className='h-full w-full overflow-hidden'
      dataTestId='profile-home-alerts-fallback-card'
      onClick={handleClick}
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

export const ProfileHomeRail = memo(function ProfileHomeRail({
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
  pacArtPriority = false,
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

  // One ordered card list — back catalog, merch, and shows. The featured
  // latest release is NOT an entity card here: it lives in the carousel's
  // leading slot as the PAC card below, so it never renders twice.
  const carouselItems = useMemo<EntityCardModel[]>(() => {
    const featuredItems: EntityCardModel[] = [];
    const releaseItems: EntityCardModel[] = [];
    const merchItems: EntityCardModel[] = [];
    const showItems: EntityCardModel[] = [];

    // The PAC card hosts the visible latest release; only the slug is needed
    // here to keep it out of the plain catalog list.
    const hasFeaturedRelease = Boolean(
      releaseVisibility?.show && latestRelease
    );
    const featuredReleaseSlug =
      hasFeaturedRelease && latestRelease ? latestRelease.slug : null;

    if (
      !hasFeaturedRelease &&
      upcomingTourDates.length === 0 &&
      featuredPlaylistFallback
    ) {
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
          ticketStatus: show.ticketStatus,
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

  // One screen, one primary focus: the carousel IS the home surface. The PAC
  // card is the featured first card; the alerts card is the last card. Both
  // render inside the same fixed card geometry — no stacked sections.
  return (
    <div
      ref={exposureRef}
      className='flex min-h-0 min-w-0 flex-1 flex-col md:mx-auto md:w-full md:max-w-80'
      data-testid='profile-home-rail'
    >
      <ReleaseCatalogCarousel
        items={carouselItems}
        artistHandle={artist.handle}
        artistId={artist.id}
        analyticsEnabled={renderMode !== 'preview'}
        leading={
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
        }
        trailing={alertsCard}
      />
    </div>
  );
});
