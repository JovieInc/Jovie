'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import {
  ProfileNotificationsContext,
  useProfileShell,
} from '@/components/organisms/profile-shell';
import { ContactDrawer } from '@/features/profile/artist-contacts-button/ContactDrawer';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import {
  PROFILE_MODE_KEYS,
  type ProfileMode,
  type ProfileV2OverlayMode,
} from '@/features/profile/contracts';
import { ListenDrawer } from '@/features/profile/ListenDrawer';
import { resolveFeaturedContent } from '@/features/profile/ProfileFeaturedCard';
import { ArtistHero } from '@/features/profile/ProfileHeroCard';
import { ProfileScrollBody } from '@/features/profile/ProfileScrollBody';
import { ProfileViewportShell } from '@/features/profile/ProfileViewportShell';
import { resolveProfileV2Presentation } from '@/features/profile/profile-v2-presentation';
import { TipDrawer } from '@/features/profile/TipDrawer';
import { extractVenmoUsername } from '@/features/profile/utils/venmo';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import { getHeaderSocialLinks } from '@/lib/utils/context-aware-links';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';

interface PublicProfileTemplateV2Props {
  readonly mode: ProfileMode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly latestRelease?: {
    readonly title: string;
    readonly slug: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: Date | string | null;
    readonly releaseType: string;
  } | null;
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly tourDates: TourDateViewModel[];
  readonly visitTrackingToken?: string;
  readonly viewerCountryCode?: string | null;
}

function unwrapNextImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname !== '/_next/image') {
      return url;
    }

    return parsed.searchParams.get('url') ?? url;
  } catch {
    return url;
  }
}

function buildModeHref(mode: ProfileMode): string {
  const url = new URL(globalThis.location.href);
  if (mode === 'profile') {
    url.searchParams.delete('mode');
  } else {
    url.searchParams.set('mode', mode);
  }

  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}`;
}

function getModeFromLocation(): ProfileMode {
  const searchMode = new URLSearchParams(globalThis.location.search).get(
    'mode'
  );

  if (searchMode && PROFILE_MODE_KEYS.includes(searchMode as ProfileMode)) {
    return searchMode as ProfileMode;
  }

  return 'profile';
}

export function PublicProfileTemplateV2({
  mode,
  artist,
  socialLinks,
  contacts,
  latestRelease,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  genres,
  photoDownloadSizes = [],
  tourDates,
  visitTrackingToken,
  viewerCountryCode,
}: PublicProfileTemplateV2Props) {
  const [activeOverlay, setActiveOverlay] =
    useState<ProfileV2OverlayMode>(null);
  const [historyMode, setHistoryMode] = useState<ProfileMode>(mode);
  const subscribeSectionRef = useRef<HTMLElement | null>(null);
  const tourSectionRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const mergedDSPs = useMemo(
    () =>
      sortDSPsByGeoPopularity(
        getCanonicalProfileDSPs(artist, socialLinks),
        viewerCountryCode
      ),
    [artist, socialLinks, viewerCountryCode]
  );
  const {
    available,
    primaryChannel,
    isEnabled: hasContacts,
  } = useArtistContacts({
    contacts,
    artistHandle: artist.handle,
  });
  const venmoLink =
    socialLinks.find(link => link.platform === 'venmo')?.url ?? null;
  const venmoUsername = extractVenmoUsername(venmoLink);
  const initialSource = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return new URLSearchParams(globalThis.location.search).get('source');
  }, []);

  const heroImageUrl = useMemo(() => {
    return unwrapNextImageUrl(
      photoDownloadSizes.find(size => size.key === 'large')?.url ??
        photoDownloadSizes.find(size => size.key === 'original')?.url ??
        artist.image_url ??
        null
    );
  }, [artist.image_url, photoDownloadSizes]);

  const { notificationsContextValue } = useProfileShell({
    artist,
    socialLinks,
    viewerCountryCode,
    contacts,
    visitTrackingToken,
    modeOverride: historyMode,
    sourceOverride: initialSource,
  });

  const scrollToTourSection = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let frame = 0;
    let cancelled = false;

    const attemptScroll = () => {
      if (cancelled) {
        return;
      }

      const tourSection = tourSectionRef.current;
      if (tourSection) {
        tourSection.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
        return;
      }

      frame += 1;
      if (frame < 10) {
        globalThis.requestAnimationFrame(attemptScroll);
      }
    };

    globalThis.requestAnimationFrame(attemptScroll);

    return () => {
      cancelled = true;
    };
  }, [prefersReducedMotion]);

  const scrollToSubscribeSection = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const subscribeSection = subscribeSectionRef.current;
    if (!subscribeSection) {
      return;
    }

    subscribeSection.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [prefersReducedMotion]);

  const applyRequestedMode = useCallback(
    (nextMode: ProfileMode) => {
      setHistoryMode(nextMode);

      const presentation = resolveProfileV2Presentation(nextMode);
      let nextOverlay = presentation.initialOverlay;

      if (nextOverlay === 'listen' && mergedDSPs.length === 0) {
        nextOverlay = null;
      }
      if (nextOverlay === 'contact' && !hasContacts) {
        nextOverlay = null;
      }
      if (nextOverlay === 'tip' && !venmoLink) {
        nextOverlay = null;
      }
      if (nextMode === 'subscribe') {
        nextOverlay = null;
      }

      setActiveOverlay(nextOverlay);

      if (nextMode === 'subscribe') {
        scrollToSubscribeSection();
        return undefined;
      }

      if (presentation.scrollTarget === 'tour' && tourDates.length > 0) {
        return scrollToTourSection();
      }

      return undefined;
    },
    [
      hasContacts,
      mergedDSPs.length,
      scrollToSubscribeSection,
      scrollToTourSection,
      tourDates.length,
      venmoLink,
    ]
  );

  useEffect(() => applyRequestedMode(mode), [applyRequestedMode, mode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      void applyRequestedMode(getModeFromLocation());
    };

    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [applyRequestedMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const href = buildModeHref(historyMode);
    const currentHref = `${globalThis.location.pathname}${globalThis.location.search}`;
    if (currentHref === href) {
      return;
    }

    globalThis.history.pushState(globalThis.history.state, '', href);
  }, [historyMode]);

  const visibleSocialLinks = useMemo(() => {
    return getHeaderSocialLinks(socialLinks, viewerCountryCode, 2);
  }, [socialLinks, viewerCountryCode]);

  const featuredContent = useMemo(
    () => resolveFeaturedContent(tourDates, latestRelease),
    [latestRelease, tourDates]
  );

  const primaryActionKind = useMemo(() => {
    if (featuredContent.kind === 'tour') {
      return 'tickets' as const;
    }

    if (mergedDSPs.length > 0) {
      return 'listen' as const;
    }

    return 'subscribe' as const;
  }, [featuredContent.kind, mergedDSPs.length]);

  const setOverlayState = useCallback((nextOverlay: ProfileV2OverlayMode) => {
    setActiveOverlay(nextOverlay);
    setHistoryMode(nextOverlay ?? 'profile');
  }, []);

  const handlePlayClick = useCallback(() => {
    if (mergedDSPs.length === 0) {
      setHistoryMode('subscribe');
      setActiveOverlay(null);
      scrollToSubscribeSection();
      return;
    }

    setOverlayState('listen');
  }, [mergedDSPs.length, scrollToSubscribeSection, setOverlayState]);

  const handleBellClick = useCallback(() => {
    setHistoryMode('subscribe');
    setActiveOverlay(null);
    scrollToSubscribeSection();
  }, [scrollToSubscribeSection]);

  const handleContactClick = useCallback(() => {
    if (!hasContacts) {
      return;
    }

    setOverlayState('contact');
  }, [hasContacts, setOverlayState]);

  const handleTipClick = useCallback(() => {
    if (!venmoLink) {
      return;
    }

    setOverlayState('tip');
  }, [setOverlayState, venmoLink]);

  const primaryAction = useMemo(() => {
    switch (primaryActionKind) {
      case 'tickets':
        return {
          label: 'Get Tickets',
          href:
            featuredContent.kind === 'tour'
              ? (featuredContent.tourDate.ticketUrl ?? null)
              : null,
          external:
            featuredContent.kind === 'tour' &&
            Boolean(featuredContent.tourDate.ticketUrl),
          // When no external ticket URL exists, ProfileHeroCard renders a
          // button and uses this handler to jump down to the tour section.
          onClick: () => {
            setHistoryMode('tour');
            void scrollToTourSection();
          },
          ariaLabel: `Get tickets for ${artist.name}`,
        };
      case 'listen':
        return null;
      case 'subscribe':
      default:
        return null;
    }
  }, [artist.name, featuredContent, primaryActionKind, scrollToTourSection]);

  const heroSpotlight = useMemo(() => {
    if (featuredContent.kind === 'tour') {
      return {
        label: 'Next show',
        value: new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
        }).format(new Date(featuredContent.tourDate.startDate)),
      };
    }

    if (
      featuredContent.kind === 'release' &&
      featuredContent.release.releaseDate
    ) {
      return {
        label: 'Latest release',
        value: new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
        }).format(new Date(featuredContent.release.releaseDate)),
      };
    }

    return {
      label: mergedDSPs.length > 0 ? 'Listen now' : 'Profile',
      value:
        mergedDSPs.length > 0
          ? `${mergedDSPs.length} platforms`
          : artist.handle,
    };
  }, [artist.handle, featuredContent, mergedDSPs.length]);

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <ProfileViewportShell
        ambientImageUrl={heroImageUrl}
        artistName={artist.name}
        header={
          <ArtistHero
            artist={artist}
            heroImageUrl={heroImageUrl}
            latestRelease={latestRelease}
            primaryAction={primaryAction}
            primaryActionKind={primaryActionKind}
            spotlightLabel={heroSpotlight.label}
            spotlightValue={heroSpotlight.value}
            socialLinks={visibleSocialLinks}
            onPlayClick={handlePlayClick}
            onBellClick={handleBellClick}
          />
        }
      >
        <div
          className='relative flex h-full flex-col overflow-hidden'
          data-test='public-profile-root'
        >
          <ProfileScrollBody
            artist={artist}
            socialLinks={visibleSocialLinks}
            contacts={available}
            latestRelease={latestRelease}
            mergedDSPs={mergedDSPs}
            enableDynamicEngagement={enableDynamicEngagement}
            genres={genres}
            tourDates={tourDates}
            hasTip={Boolean(venmoLink)}
            primaryActionKind={primaryActionKind}
            subscribeTwoStep={subscribeTwoStep}
            subscribeSectionRef={subscribeSectionRef}
            subscribeModeActive={historyMode === 'subscribe'}
            onTipClick={handleTipClick}
            onContactClick={handleContactClick}
            tourSectionRef={tourSectionRef}
          />
        </div>

        {mergedDSPs.length > 0 ? (
          <ListenDrawer
            open={activeOverlay === 'listen'}
            onOpenChange={open => setOverlayState(open ? 'listen' : null)}
            artist={artist}
            dsps={mergedDSPs}
            enableDynamicEngagement={enableDynamicEngagement}
          />
        ) : null}

        {venmoLink ? (
          <TipDrawer
            open={activeOverlay === 'tip'}
            onOpenChange={open => setOverlayState(open ? 'tip' : null)}
            artistName={artist.name}
            artistHandle={artist.handle}
            venmoLink={venmoLink}
            venmoUsername={venmoUsername}
          />
        ) : null}

        {hasContacts ? (
          <ContactDrawer
            open={activeOverlay === 'contact'}
            onOpenChange={open => setOverlayState(open ? 'contact' : null)}
            artistName={artist.name}
            artistHandle={artist.handle}
            contacts={available}
            primaryChannel={primaryChannel}
          />
        ) : null}
      </ProfileViewportShell>
    </ProfileNotificationsContext.Provider>
  );
}
