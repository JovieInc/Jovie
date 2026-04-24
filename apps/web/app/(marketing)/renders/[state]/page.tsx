'use client';

import { useParams, useSearchParams } from 'next/navigation';
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

const VALID_STATES = Object.keys(
  HOMEPAGE_PROFILE_SHOWCASE_STATES
) as ProfileShowcaseStateId[];

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

export default function MarketingRenderPage() {
  const params = useParams<{ state: string }>();
  const searchParams = useSearchParams();

  const stateId = params.state as ProfileShowcaseStateId;
  const hideChrome = searchParams.get('chrome') !== 'true';
  const width = searchParams.get('width') ?? '430';

  if (!VALID_STATES.includes(stateId)) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-black text-white'>
        <div className='text-center'>
          <h1 className='text-2xl font-semibold'>Unknown state: {stateId}</h1>
          <p className='mt-4 text-white/60'>Available states:</p>
          <ul className='mt-2 space-y-1 text-sm text-white/40'>
            {VALID_STATES.map(s => (
              <li key={s}>
                <a href={`/renders/${s}`} className='hover:text-white/80'>
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const state = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId];

  return (
    <div
      className='flex min-h-screen items-center justify-center bg-black'
      style={{ padding: '2rem' }}
    >
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
          showSubscriptionConfirmedBanner={
            state.showSubscriptionConfirmedBanner
          }
          drawerOpen={state.drawerView !== null}
          drawerView={state.drawerView ?? 'menu'}
          activeMode={getPreviewActiveMode(stateId)}
          onDrawerOpenChange={() => {}}
          onDrawerViewChange={() => {}}
          onModeSelect={() => {}}
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
    </div>
  );
}
