'use client';

import { useSearchParams } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_CONTACTS,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
  HOMEPAGE_PROFILE_SHOWCASE_STATES,
} from '@/features/home/homepage-profile-preview-fixture';
import type {
  ProfilePrimaryTab,
  ProfileShowcaseStateId,
} from '@/features/profile/contracts';
import { ProfileCompactSurface } from '@/features/profile/templates/ProfileCompactSurface';

interface MarketingStateRenderClientProps {
  readonly stateId: ProfileShowcaseStateId;
}

function getLatestRelease(stateId: ProfileShowcaseStateId) {
  const state = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId];
  switch (state.latestReleaseKey) {
    case 'presave':
      return HOMEPAGE_PROFILE_PREVIEW_RELEASES.presave;
    case 'live':
      return HOMEPAGE_PROFILE_PREVIEW_RELEASES.live;
    default:
      return null;
  }
}

function getPreviewActiveMode(
  stateId: ProfileShowcaseStateId
): ProfilePrimaryTab {
  const drawerView = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId].drawerView;

  switch (drawerView) {
    case 'listen':
    case 'subscribe':
    case 'tour':
      return drawerView;
    default:
      return 'profile';
  }
}

function getRenderWidth(value: string | null) {
  const width = Number.parseInt(value ?? '430', 10);
  return Number.isFinite(width) ? width : 430;
}

export function MarketingStateRenderClient({
  stateId,
}: MarketingStateRenderClientProps) {
  const searchParams = useSearchParams();
  const state = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId];
  const hideChrome = searchParams.get('chrome') !== 'true';
  const width = getRenderWidth(searchParams.get('width'));

  return (
    <div
      style={{
        width: `${width}px`,
        maxWidth: '100%',
        borderRadius: '2rem',
        overflow: 'hidden',
        background: '#030507',
      }}
      data-testid='marketing-render'
      data-hide-chrome={hideChrome}
    >
      <ProfileCompactSurface
        dataTestId='marketing-render-surface'
        renderMode='preview'
        presentation='embedded'
        artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
        socialLinks={[...HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS]}
        contacts={[...HOMEPAGE_PROFILE_PREVIEW_CONTACTS]}
        latestRelease={getLatestRelease(stateId)}
        profileSettings={{ showOldReleases: true }}
        genres={HOMEPAGE_PROFILE_PREVIEW_ARTIST.genres ?? []}
        photoDownloadSizes={[]}
        pressPhotos={[]}
        allowPhotoDownloads={false}
        tourDates={[...HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES]}
        showSubscriptionConfirmedBanner={state.showSubscriptionConfirmedBanner}
        drawerOpen={state.drawerView !== null}
        drawerView={state.drawerView ?? 'menu'}
        activeMode={getPreviewActiveMode(stateId)}
        onDrawerOpenChange={() => {}}
        onDrawerViewChange={() => {}}
        onModeSelect={() => {}}
        onBack={() => {}}
        onOpenMenu={() => {}}
        onPlayClick={() => {}}
        onShare={() => {}}
        profileHref={`/${HOMEPAGE_PROFILE_PREVIEW_ARTIST.handle}`}
        artistProfilesHref={APP_ROUTES.ARTIST_PROFILES}
        isSubscribed={
          stateId === 'fans-confirmed' ||
          stateId === 'fans-song-alert' ||
          stateId === 'fans-show-alert'
        }
        onTogglePref={() => {}}
        onUnsubscribe={() => {}}
        onManageNotifications={() => {}}
        onRegisterReveal={() => {}}
        onRevealNotifications={() => {}}
        previewNotificationsState={state.notifications}
        previewReleaseActionLabel={state.releaseActionLabel}
        hideJovieBranding={hideChrome}
        hideMoreMenu={hideChrome}
      />
    </div>
  );
}
