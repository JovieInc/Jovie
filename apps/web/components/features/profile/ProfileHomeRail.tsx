'use client';

import { memo, useMemo, useState } from 'react';
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
} from '@/lib/flags/profile-pac';
import type { PublicMerchCard } from '@/lib/merch/types';
import type { ProfileCardAccentAssignment } from '@/lib/profile/mode-card-accent';
import { pickOneRightThing } from '@/lib/profile/one-right-thing/engine';
import { featuredEventExtras } from '@/lib/profile/one-right-thing/event-extras';
import { useReturningMarker } from '@/lib/profile/one-right-thing/use-returning-marker';
import {
  type ProfileVariantSeed,
  signalsFromVariantSeed,
} from '@/lib/profile/one-right-thing/variant';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist } from '@/types/db';
import {
  isPacReleaseUpcoming,
  ProfilePacCard,
  type ProfilePacRelease,
} from './pac/ProfilePacCard';
import type { PublicRelease } from './releases/types';
import { usePacEvents } from './usePacEvents';

interface ProfileHomeRailProps {
  readonly artist: Artist;
  readonly latestRelease?: ProfilePrimaryActionCardRelease | null;
  readonly profileSettings?: {
    readonly showOldReleases?: boolean;
  } | null;
  readonly tourDates?: readonly TourDateViewModel[];
  readonly hasPlayableDestinations: boolean;
  readonly captureEnabled?: boolean;
  readonly renderMode?: ProfileRenderMode;
  readonly previewActionLabel?: string;
  readonly isSubscribed?: boolean;
  readonly profilePacAssignment?: ProfilePacAssignment;
  readonly viewerLocation?: UserLocation | null;
  readonly resolveNearbyTour?: boolean;
  readonly merchCards?: readonly PublicMerchCard[];
  /**
   * Request signals decoded from the ISR variant. The pick is decided on the
   * server from these, so hydration reproduces it exactly (no swap).
   */
  readonly featuredSeed?: ProfileVariantSeed | null;
  /** ISO time of the server render; the pick is evaluated at this instant. */
  readonly featuredRenderedAt?: string;
  readonly releases?: readonly PublicRelease[];
  readonly hasTip?: boolean;
  /**
   * Set when the profile has no hero photo: the PAC card's artwork becomes
   * the LCP image, so it must load with priority instead of lazy.
   */
  readonly pacArtPriority?: boolean;
  /** Rotating accent for the featured Listen card (mode-card-accent.ts). */
  readonly featuredAccent?: ProfileCardAccentAssignment;
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

/**
 * Editorial surface (JOV-6199, JOV-7123): Home is one curated card — the
 * featured PAC — not a catalog stack. The PAC's state machine resolves the
 * subject per visitor (release, merch, next show, tip, listen, capture), so
 * no secondary card carousel follows it. The full catalog lives on the Music
 * destination and fan capture lives inside the card's prompt state.
 */
export const ProfileHomeRail = memo(function ProfileHomeRail({
  artist,
  latestRelease,
  profileSettings,
  tourDates = [],
  hasPlayableDestinations,
  captureEnabled = true,
  renderMode = 'interactive',
  isSubscribed = false,
  profilePacAssignment = DEFAULT_PROFILE_PAC_ASSIGNMENT,
  viewerLocation,
  resolveNearbyTour = true,
  merchCards = [],
  featuredSeed = null,
  featuredRenderedAt,
  releases = [],
  hasTip = false,
  pacArtPriority = false,
  featuredAccent,
}: Readonly<ProfileHomeRailProps>) {
  // PAC instrumentation (spec §8): pac_exposure fires when the card is ≥50%
  // visible, once per state per session, keyed to the visitor's variant.
  const isInteractiveRender = renderMode === 'interactive';
  useReturningMarker(isInteractiveRender, artist.handle);
  // Re-evaluate visibility at the release boundary so the card's "Drops in"
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
  // one-modal-layer-v1: never open the browser geolocation prompt from a
  // passive surface — use cached/granted location only.
  const { location } = useUserLocation({
    enabled: shouldResolveGeo,
    permissionMode: 'granted-only',
  });
  const effectiveLocation = viewerLocation ?? location;
  const { nearbyDates } = useTourDateProximity(
    upcomingTourDates,
    effectiveLocation
  );
  const nearbyTourDateId = nearbyDates[0]?.date?.id ?? null;

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
        releaseType: latestRelease.releaseType,
        releaseDate: latestRelease.releaseDate,
      };
    }
    // Fallback subject: the newest release fans can already play. An
    // upcoming release is only featured through the visibility rules above
    // (countdown), never as an implicit "latest" — that disagreed with the
    // profile's own "latest release" copy and linked "Listen" to a
    // coming-soon page.
    const linkable = releases.filter(release => release.slug !== '');
    const newest =
      linkable.find(release => !isPacReleaseUpcoming(release, now)) ??
      linkable[0];
    if (!newest) return null;
    return {
      title: newest.title,
      slug: newest.slug,
      artworkUrl: newest.artworkUrl,
      previewUrl: newest.previewUrl ?? null,
      releaseType: newest.releaseType,
      releaseDate: newest.releaseDate,
    };
  }, [latestRelease, now, releases, releaseVisibility?.show]);

  const pacNextShow =
    upcomingTourDates.find(show => show.id === nearbyTourDateId) ??
    upcomingTourDates[0] ??
    null;
  const hasPacSubject = Boolean(
    pacRelease ||
      merchCards[0] ||
      pacNextShow ||
      hasTip ||
      hasPlayableDestinations
  );

  // One right thing: a deterministic, explainable pick for this visitor. The
  // first render uses neutral signals (identical for everyone, ISR-safe); it
  // can only change after hydration. Previews and fixtures never personalize.
  // Fixed for the page's lifetime: never advances, so the card cannot swap.
  const [decisionNow] = useState(() =>
    featuredRenderedAt ? new Date(featuredRenderedAt) : new Date()
  );
  const featuredDecision = useMemo(() => {
    if (!isInteractiveRender || !hasPacSubject) return null;
    return pickOneRightThing({
      signals: signalsFromVariantSeed(featuredSeed, decisionNow),
      inventory: {
        release: pacRelease
          ? {
              slug: pacRelease.slug,
              releaseDate: pacRelease.releaseDate ?? null,
              isUpcoming: isPacReleaseUpcoming(pacRelease, decisionNow),
            }
          : null,
        shows: tourDates.map(show => ({
          id: show.id,
          startDate: show.startDate,
          country: show.country,
          ticketUrl: show.ticketUrl,
        })),
        hasMerch: Boolean(merchCards[0]),
        hasTip,
        hasListen: hasPlayableDestinations,
      },
      // No artist-facing control for pinning exists yet.
      artistPriority: null,
    });
  }, [
    hasPacSubject,
    hasPlayableDestinations,
    hasTip,
    isInteractiveRender,
    merchCards,
    decisionNow,
    pacRelease,
    tourDates,
    featuredSeed,
  ]);
  const featuredShow =
    featuredDecision?.kind === 'show'
      ? (upcomingTourDates.find(show => show.id === featuredDecision.refId) ??
        pacNextShow)
      : pacNextShow;

  const { exposureRef } = usePacEvents({
    profileId: artist.id,
    assignment: profilePacAssignment,
    enabled: renderMode !== 'preview',
    baseExtras: featuredEventExtras(featuredDecision),
  });

  // Pen parity (Tim, 2026-09-26/28): the featured editorial card is the only
  // card surface under the identity header — it replaces the highlights
  // carousel in place rather than stacking above it.
  return (
    <div
      ref={exposureRef}
      className='flex min-h-0 min-w-0 flex-1 flex-col gap-4 md:mx-auto md:w-full'
      data-testid='profile-home-rail'
    >
      <h2 className='sr-only'>Profile Highlights From {artist.name}</h2>
      {hasPacSubject ? (
        <ProfilePacCard
          artist={artist}
          release={pacRelease}
          merchCard={merchCards[0] ?? null}
          nextShow={featuredShow}
          featured={featuredDecision}
          hasTip={hasTip}
          assignment={profilePacAssignment}
          isSubscribed={isSubscribed}
          renderMode={renderMode}
          layout='profile-landscape'
          presentation='featured'
          accent={featuredAccent}
          artPriority={pacArtPriority}
          hasPlayableDestinations={hasPlayableDestinations}
          captureEnabled={captureEnabled}
        />
      ) : null}
    </div>
  );
});
