'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { ProfileHeaderV2 } from '@/components/organisms/profile-header-v2/ProfileHeaderV2';
import {
  ProfileNotificationsContext,
  useProfileShell,
} from '@/components/organisms/profile-shell';
import {
  type ProfileMode,
  SWIPEABLE_MODES,
  type SwipeableProfileMode,
} from '@/features/profile/contracts';
import { ListenDrawer } from '@/features/profile/ListenDrawer';
import { ProfileHeroCard } from '@/features/profile/ProfileHeroCard';
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
  readonly tourDates: TourDateViewModel[];
  readonly visitTrackingToken?: string;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly allowPhotoDownloads?: boolean;
}

function normalizeInitialMode(mode: ProfileMode): SwipeableProfileMode {
  if (SWIPEABLE_MODES.includes(mode as SwipeableProfileMode)) {
    return mode as SwipeableProfileMode;
  }

  return 'profile';
}

function buildModeHref(mode: SwipeableProfileMode): string {
  const url = new URL(globalThis.location.href);
  if (mode === 'profile') {
    url.searchParams.delete('mode');
  } else {
    url.searchParams.set('mode', mode);
  }

  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}`;
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
  tourDates,
  visitTrackingToken,
}: PublicProfileTemplateV2Props) {
  const [listenDrawerOpen, setListenDrawerOpen] = useState(false);
  const initialMode = normalizeInitialMode(mode);
  const initialIndex = SWIPEABLE_MODES.indexOf(initialMode);
  const mergedDSPs = useMemo(
    () => getCanonicalProfileDSPs(artist, socialLinks),
    [artist, socialLinks]
  );
  const { notificationsContextValue } = useProfileShell({
    artist,
    socialLinks,
    contacts,
    visitTrackingToken,
  });

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const href = buildModeHref(activeMode);
    globalThis.history.replaceState(globalThis.history.state, '', href);
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
      handleModeSelect('listen');
      return;
    }

    setListenDrawerOpen(true);
  };

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <div
        className='relative h-[100dvh] overflow-hidden bg-base text-primary-token'
        data-test='public-profile-root'
      >
        <div className='pointer-events-none absolute inset-0 overflow-hidden'>
          <div className='absolute left-[-10%] top-10 h-48 w-48 rounded-full bg-surface-2/70 blur-3xl' />
          <div className='absolute bottom-0 right-[-10%] h-56 w-56 rounded-full bg-surface-3/60 blur-3xl' />
        </div>

        <div className='relative mx-auto grid h-full w-full max-w-2xl grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden px-2 pt-[max(env(safe-area-inset-top),0.75rem)]'>
          <ProfileHeaderV2
            artist={artist}
            activeMode={activeMode}
            activeIndex={activeIndex}
            modes={SWIPEABLE_MODES}
            headerSocialLinks={headerSocialLinks}
            onModeSelect={handleModeSelect}
            onPlayClick={handlePlayClick}
          />

          <ProfileHeroCard
            artist={artist}
            socialLinks={socialLinks}
            mergedDSPs={mergedDSPs}
            latestRelease={latestRelease}
            enableDynamicEngagement={enableDynamicEngagement}
            subscribeTwoStep={subscribeTwoStep}
            autoOpenCapture={mode === 'subscribe'}
          />

          <SwipeableModeContainer
            artist={artist}
            socialLinks={socialLinks}
            latestRelease={latestRelease}
            mergedDSPs={mergedDSPs}
            enableDynamicEngagement={enableDynamicEngagement}
            genres={genres}
            tourDates={tourDates}
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
      </div>
    </ProfileNotificationsContext.Provider>
  );
}
