'use client';

import { Bell } from 'lucide-react';
import { useMemo } from 'react';
import {
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
import type { PublicMerchCard } from '@/lib/merch/types';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';
import { ReleaseCatalogCarousel } from './ReleaseCatalogCarousel';
import type { PublicRelease } from './releases/types';

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
  readonly merchCards?: readonly PublicMerchCard[];
  readonly releases?: readonly PublicRelease[];
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
        ? 'group flex min-h-16 w-full min-w-0 items-center gap-3 rounded-(--profile-inner-radius) border border-white/10 bg-white/5 px-3.5 py-3 text-left text-white shadow-card backdrop-blur-2xl transition-colors duration-subtle hover:bg-white/10 active:opacity-90'
        : 'group flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-3 text-left text-white shadow-card backdrop-blur-2xl transition-colors duration-subtle hover:bg-white/10 active:opacity-90',
    'data-testid':
      variant === 'bento'
        ? 'profile-home-alerts-fallback-card'
        : 'profile-home-alerts-row',
  } as const;
  const ariaLabel = `Turn on alerts for ${artist.name}`;
  const content = (
    <>
      <Bell
        className={cn(
          'shrink-0 text-white/84',
          variant === 'bento' ? 'h-5 w-5' : 'h-4 w-4'
        )}
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1'>
        <span
          className={
            variant === 'bento'
              ? 'block text-app font-semibold leading-tight [overflow-wrap:anywhere]'
              : 'block text-xs font-semibold leading-4 [overflow-wrap:anywhere]'
          }
        >
          {title}
        </span>
        <span
          className={
            variant === 'bento'
              ? 'mt-0.5 block max-w-64 text-2xs leading-4 text-white/55 [overflow-wrap:anywhere]'
              : 'mt-0.5 block text-2xs leading-3.5 text-white/50 [overflow-wrap:anywhere]'
          }
        >
          {description}
        </span>
      </span>
      <span
        className='relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-white/12 bg-white/15 p-1 shadow-sm transition-colors duration-subtle group-hover:bg-white/20'
        aria-hidden='true'
        data-testid='profile-home-alerts-switch'
      >
        <span className='block h-6 w-6 rounded-full bg-white dark:bg-white shadow-[0_3px_10px_rgba(0,0,0,0.32)]' />
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
  renderMode = 'interactive',
  onAlertsClick,
  isSubscribed = false,
  viewerLocation,
  resolveNearbyTour = true,
  merchCards = [],
  releases = [],
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
  const nearbyTourDateId = nearbyDates[0]?.date?.id ?? null;

  // One ordered card list — featured item first, then the rest. No stacked
  // sections: a single carousel is the profile home surface.
  const carouselItems = useMemo<EntityCardModel[]>(() => {
    const items: EntityCardModel[] = [];

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
      items.push(
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
      items.push({
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
      items.push(releaseToEntityCard(release, { handle: artist.handle, now }));
    }

    // Shoppable merch (revenue) next.
    for (const card of merchCards) {
      items.push(merchToEntityCard(card, { handle: artist.handle }));
    }

    // Upcoming shows, nearest-to-viewer first when geo resolved.
    const shows = [...upcomingTourDates].sort((a, b) =>
      a.id === nearbyTourDateId ? -1 : b.id === nearbyTourDateId ? 1 : 0
    );
    for (const show of shows) {
      items.push(
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

    return items;
  }, [
    artist.handle,
    featuredPlaylistFallback,
    latestRelease,
    merchCards,
    nearbyTourDateId,
    now,
    releases,
    releaseVisibility?.show,
    upcomingTourDates,
  ]);

  const alertsCard = isSubscribed ? null : (
    <HomeAlertsCard
      artist={artist}
      onAlertsClick={onAlertsClick}
      renderMode={renderMode}
      variant='bento'
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
      className='min-w-0 space-y-2 md:mx-auto md:w-full md:max-w-80'
      data-testid='profile-home-rail'
    >
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
