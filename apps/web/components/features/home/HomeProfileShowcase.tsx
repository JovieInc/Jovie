'use client';

import { useEffect, useRef } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import type { ProfileShowcaseStateId } from '@/features/profile/contracts';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { ProfileCompactSurface } from '../profile/templates/ProfileCompactSurface';
import { HomePhoneFrame } from './HomePhoneFrame';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_CONTACTS,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
  HOMEPAGE_PROFILE_SHOWCASE_STATES,
} from './homepage-profile-preview-fixture';

interface HomeProfileShowcaseProps {
  readonly stateId: ProfileShowcaseStateId;
  readonly compact?: boolean;
  readonly className?: string;
}

function getLatestRelease(stateId: ProfileShowcaseStateId) {
  const state = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId];

  switch (state.latestReleaseKey) {
    case 'presave':
      return HOMEPAGE_PROFILE_PREVIEW_RELEASES.presave;
    case 'live':
      return HOMEPAGE_PROFILE_PREVIEW_RELEASES.live;
    case 'none':
    default:
      return null;
  }
}

export function HomeProfileShowcase({
  stateId,
  compact = false,
  className,
}: Readonly<HomeProfileShowcaseProps>) {
  const state = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId];
  const reducedMotion = useReducedMotion();
  const inertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = inertRef.current;
    if (!node) {
      return;
    }

    // scene id -> shared showcase state -> shared public-profile renderer
    node.inert = true;
  }, []);

  return (
    <div
      ref={inertRef}
      aria-hidden='true'
      inert
      className={cn(
        'pointer-events-none select-none',
        reducedMotion ? 'motion-reduce' : 'motion-default',
        className
      )}
      data-motion-mode={reducedMotion ? 'reduced' : 'default'}
      data-testid={`homepage-phone-state-${state.id}`}
    >
      <HomePhoneFrame compact={compact}>
        <div className='h-full w-full bg-black/96'>
          <ProfileCompactSurface
            dataTestId='homepage-profile-preview'
            renderMode='preview'
            presentation='embedded'
            artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
            socialLinks={[...HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS]}
            contacts={[...HOMEPAGE_PROFILE_PREVIEW_CONTACTS]}
            latestRelease={getLatestRelease(state.id)}
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
            onDrawerOpenChange={() => {}}
            onDrawerViewChange={() => {}}
            onOpenMenu={() => {}}
            onPlayClick={() => {}}
            onShare={() => {}}
            profileHref={`/${HOMEPAGE_PROFILE_PREVIEW_ARTIST.handle}`}
            artistProfilesHref={APP_ROUTES.ARTIST_PROFILES}
            isSubscribed={state.id === 'subscribe'}
            onTogglePref={() => {}}
            onUnsubscribe={() => {}}
            onManageNotifications={() => {}}
            onRegisterReveal={() => {}}
            onRevealNotifications={() => {}}
            previewNotificationsState={state.notifications}
          />
        </div>
      </HomePhoneFrame>
    </div>
  );
}
