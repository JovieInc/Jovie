'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import {
  ProfileNotificationsContext,
  useProfileShell,
} from '@/components/organisms/profile-shell';
import { ContactDrawer } from '@/features/profile/artist-contacts-button/ContactDrawer';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import {
  type ProfileMode,
  SWIPEABLE_MODES,
  type SwipeableProfileMode,
} from '@/features/profile/contracts';
import { ListenDrawer } from '@/features/profile/ListenDrawer';
import { ArtistHero } from '@/features/profile/ProfileHeroCard';
import { ProfileQuickActions } from '@/features/profile/ProfileQuickActions';
import { ProfileViewportShell } from '@/features/profile/ProfileViewportShell';
import { resolveProfileV2Presentation } from '@/features/profile/profile-v2-presentation';
import { SubscribeDrawer } from '@/features/profile/SubscribeDrawer';
import { SwipeableModeContainer } from '@/features/profile/SwipeableModeContainer';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import {
  detectSourcePlatform,
  getHeaderSocialLinks,
} from '@/lib/utils/context-aware-links';
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

function buildModeHref(mode: SwipeableProfileMode): string {
  const url = new URL(globalThis.location.href);
  if (mode === 'profile') {
    url.searchParams.delete('mode');
  } else {
    url.searchParams.set('mode', mode);
  }

  const search = url.searchParams.toString();
  const suffix = search ? `?${search}` : '';
  return `${url.pathname}${suffix}`;
}

function getModeFromLocation(): SwipeableProfileMode {
  const searchMode = new URLSearchParams(globalThis.location.search).get(
    'mode'
  );

  if (
    searchMode &&
    SWIPEABLE_MODES.includes(searchMode as SwipeableProfileMode)
  ) {
    return searchMode as SwipeableProfileMode;
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
  pressPhotos = [],
  allowPhotoDownloads = false,
  photoDownloadSizes = [],
  tourDates,
  visitTrackingToken,
}: PublicProfileTemplateV2Props) {
  const [listenDrawerOpen, setListenDrawerOpen] = useState(false);
  const [subscribeDrawerOpen, setSubscribeDrawerOpen] = useState(false);
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const lastNavigationModeRef = useRef<SwipeableProfileMode | null>(null);
  const { initialPane } = resolveProfileV2Presentation(mode);
  const initialIndex = SWIPEABLE_MODES.indexOf(initialPane);
  const mergedDSPs = useMemo(
    () => getCanonicalProfileDSPs(artist, socialLinks),
    [artist, socialLinks]
  );
  const {
    available,
    primaryChannel,
    isEnabled: hasContacts,
  } = useArtistContacts({
    contacts,
    artistHandle: artist.handle,
  });
  const initialSource = useMemo(() => {
    if (globalThis.window === undefined) {
      return null;
    }

    return new URLSearchParams(globalThis.location.search).get('source');
  }, []);

  const {
    activeIndex,
    containerRef,
    dragOffset,
    handlers,
    isDragging,
    setActiveIndex,
  } = useSwipeMode({
    count: SWIPEABLE_MODES.length,
    initialIndex,
  });

  const activeMode = SWIPEABLE_MODES[activeIndex] ?? 'profile';
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
    contacts,
    visitTrackingToken,
    modeOverride: activeMode,
    sourceOverride: initialSource,
  });

  useEffect(() => {
    const presentation = resolveProfileV2Presentation(mode);
    const nextIndex = SWIPEABLE_MODES.indexOf(presentation.initialPane);
    setActiveIndex(nextIndex);
    if (presentation.initialOverlay === 'listen') {
      setListenDrawerOpen(true);
    }
    if (presentation.initialOverlay === 'subscribe') {
      setSubscribeDrawerOpen(true);
    }
    if (presentation.initialOverlay === 'contact' && hasContacts) {
      setContactDrawerOpen(true);
    }
  }, [hasContacts, mode, setActiveIndex]);

  useEffect(() => {
    if (globalThis.window === undefined) return;

    const handlePopState = () => {
      const nextMode = getModeFromLocation();
      const nextIndex = SWIPEABLE_MODES.indexOf(nextMode);
      lastNavigationModeRef.current = nextMode;
      setActiveIndex(nextIndex);
    };

    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [setActiveIndex]);

  useEffect(() => {
    if (globalThis.window === undefined) return;

    const href = buildModeHref(activeMode);
    const currentHref = `${globalThis.location.pathname}${globalThis.location.search}`;

    if (currentHref === href) {
      lastNavigationModeRef.current = activeMode;
      return;
    }

    if (lastNavigationModeRef.current === activeMode) {
      return;
    }

    globalThis.history.pushState(globalThis.history.state, '', href);
    lastNavigationModeRef.current = activeMode;
  }, [activeMode]);

  const headerSocialLinks = useMemo(() => {
    if (typeof document === 'undefined') {
      return [];
    }

    const sourcePlatform = detectSourcePlatform(
      document.referrer,
      new URLSearchParams(globalThis.location.search)
    );

    return getHeaderSocialLinks(socialLinks, sourcePlatform);
  }, [socialLinks]);

  const handleModeSelect = (nextMode: SwipeableProfileMode) => {
    setActiveIndex(SWIPEABLE_MODES.indexOf(nextMode));
  };

  const handlePlayClick = () => {
    if (mergedDSPs.length === 0) {
      return;
    }

    setListenDrawerOpen(true);
  };

  const handleBellClick = () => {
    setSubscribeDrawerOpen(true);
  };

  const handleBookClick = () => {
    if (!hasContacts) return;
    setContactDrawerOpen(true);
  };

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <ProfileViewportShell
        ambientImageUrl={heroImageUrl}
        artistName={artist.name}
      >
        <div
          className='relative grid h-full w-full grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-base'
          data-test='public-profile-root'
        >
          <ArtistHero
            artist={artist}
            heroImageUrl={heroImageUrl}
            latestRelease={latestRelease}
            headerSocialLinks={headerSocialLinks}
            onPlayClick={handlePlayClick}
            onBellClick={handleBellClick}
          />

          <ProfileQuickActions
            activeMode={activeMode}
            onModeSelect={handleModeSelect}
            onBookClick={handleBookClick}
            bookingDisabled={!hasContacts}
          />

          <SwipeableModeContainer
            artist={artist}
            socialLinks={socialLinks}
            latestRelease={latestRelease}
            mergedDSPs={mergedDSPs}
            enableDynamicEngagement={enableDynamicEngagement}
            genres={genres}
            pressPhotos={pressPhotos}
            allowPhotoDownloads={allowPhotoDownloads}
            tourDates={tourDates}
            onSubscribeClick={handleBellClick}
            modes={SWIPEABLE_MODES}
            activeIndex={activeIndex}
            dragOffset={dragOffset}
            isDragging={isDragging}
            containerRef={containerRef}
            handlers={handlers}
          />
        </div>
        {mergedDSPs.length > 0 ? (
          <ListenDrawer
            open={listenDrawerOpen}
            onOpenChange={setListenDrawerOpen}
            artist={artist}
            dsps={mergedDSPs}
            enableDynamicEngagement={enableDynamicEngagement}
          />
        ) : null}
        <SubscribeDrawer
          open={subscribeDrawerOpen}
          onOpenChange={setSubscribeDrawerOpen}
          artist={artist}
          subscribeTwoStep={subscribeTwoStep}
        />
        {hasContacts ? (
          <ContactDrawer
            open={contactDrawerOpen}
            onOpenChange={setContactDrawerOpen}
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
