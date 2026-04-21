'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import type { ProfileShowcaseStateId } from '@/features/profile/contracts';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { ProfileCompactSurface } from '../profile/templates/ProfileCompactSurface';
import { HomePhoneFrame } from './HomePhoneFrame';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_CONTACTS,
  HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
  HOMEPAGE_PROFILE_SHOWCASE_STATES,
} from './homepage-profile-preview-fixture';

export type HomeProfileShowcasePresentation =
  | 'full-phone'
  | 'beauty-shot'
  | 'drawer-crop'
  | 'featured-card-crop'
  | 'surface-card';

export type HomeProfileShowcaseOverlayMode = 'auto' | 'hidden' | 'only';

export type HomeProfileShowcaseCropAnchor =
  | 'center'
  | 'left'
  | 'right'
  | 'bottom';

interface HomeProfileShowcaseProps {
  readonly stateId: ProfileShowcaseStateId;
  readonly compact?: boolean;
  readonly className?: string;
  readonly presentation?: HomeProfileShowcasePresentation;
  readonly overlayMode?: HomeProfileShowcaseOverlayMode;
  readonly cropAnchor?: HomeProfileShowcaseCropAnchor;
  readonly hideJovieBranding?: boolean;
  readonly hideMoreMenu?: boolean;
}

const SHOWCASE_VIEWER_LOCATION = {
  latitude: 34.0522,
  longitude: -118.2437,
} as const;

function HomeProfileOverlayCard({
  stateId,
  mode,
}: Readonly<{
  stateId: ProfileShowcaseStateId;
  mode: 'absolute' | 'standalone';
}>) {
  const overlay = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId].previewOverlay;

  if (!overlay) {
    return null;
  }

  const shellClassName =
    mode === 'absolute'
      ? 'homepage-showcase-overlay-card homepage-showcase-overlay-card-absolute'
      : 'homepage-showcase-overlay-card homepage-showcase-overlay-card-standalone';

  if (overlay.kind === 'apple-pay') {
    return (
      <div
        aria-hidden='true'
        data-testid='homepage-overlay-apple-pay'
        className={cn(
          shellClassName,
          'homepage-showcase-overlay-card-apple-pay'
        )}
      >
        <div className='flex items-center justify-between gap-3'>
          <p className='text-[13px] font-[620] tracking-[-0.02em] text-slate-950'>
            {overlay.title}
          </p>
          <span className='rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-[620] tracking-[0.08em] text-white'>
            Pay
          </span>
        </div>
        <p className='mt-3 text-[20px] font-[650] tracking-[-0.04em] text-slate-950'>
          {overlay.body}
        </p>
        <div className='mt-4 flex items-center justify-between rounded-[1rem] bg-white/80 px-3 py-2.5 text-[11px] font-[560] text-slate-600'>
          <span>{overlay.accentLabel}</span>
          <span>Face ID</span>
        </div>
      </div>
    );
  }

  if (overlay.kind === 'thank-you') {
    return (
      <div
        aria-hidden='true'
        data-testid='homepage-overlay-thank-you'
        className={cn(
          shellClassName,
          'homepage-showcase-overlay-card-thank-you'
        )}
      >
        <span className='inline-flex rounded-full bg-emerald-400/16 px-2.5 py-1 text-[10px] font-[620] tracking-[0.08em] text-emerald-300'>
          {overlay.accentLabel}
        </span>
        <p className='mt-3 text-[19px] font-[650] tracking-[-0.04em] text-white'>
          {overlay.title}
        </p>
        <p className='mt-2 text-[12px] leading-[1.6] text-white/68'>
          {overlay.body}
        </p>
        <div className='mt-4 rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-2.5 text-[11px] font-[560] text-white/76'>
          Take Me Over · Listen
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden='true'
      data-testid='homepage-overlay-email-preview'
      className={cn(shellClassName, 'homepage-showcase-overlay-card-email')}
    >
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-[10px] font-[620] tracking-[0.08em] text-sky-300/88'>
            {overlay.accentLabel}
          </p>
          <p className='mt-1 text-[13px] font-[620] tracking-[-0.02em] text-white'>
            {overlay.title}
          </p>
        </div>
        <div className='rounded-full bg-white/10 px-2 py-1 text-[10px] font-[560] text-white/72'>
          Email
        </div>
      </div>
      <p className='mt-2 text-[12px] leading-[1.55] text-white/68'>
        {overlay.body}
      </p>
    </div>
  );
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

function getTourDates(stateId: ProfileShowcaseStateId) {
  switch (stateId) {
    case 'playlist-fallback':
    case 'listen-fallback':
      return [];
    default:
      return [...HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES];
  }
}

function getFeaturedPlaylistFallback(stateId: ProfileShowcaseStateId) {
  return stateId === 'playlist-fallback'
    ? HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK
    : null;
}

function getViewerLocation(stateId: ProfileShowcaseStateId) {
  return stateId === 'tour-nearby' ? SHOWCASE_VIEWER_LOCATION : undefined;
}

function shouldResolveNearbyTour(stateId: ProfileShowcaseStateId) {
  return stateId === 'tour-nearby';
}

function ShowcaseSurface({
  stateId,
  hideJovieBranding,
  hideMoreMenu,
}: Readonly<{
  stateId: ProfileShowcaseStateId;
  hideJovieBranding: boolean;
  hideMoreMenu: boolean;
}>) {
  const state = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId];

  return (
    <div className='homepage-showcase-surface relative h-full w-full bg-black/96'>
      <ProfileCompactSurface
        dataTestId='homepage-profile-preview'
        renderMode='preview'
        presentation='embedded'
        artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
        socialLinks={[...HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS]}
        contacts={[...HOMEPAGE_PROFILE_PREVIEW_CONTACTS]}
        latestRelease={getLatestRelease(state.id)}
        profileSettings={{ showOldReleases: true }}
        featuredPlaylistFallback={getFeaturedPlaylistFallback(state.id)}
        genres={HOMEPAGE_PROFILE_PREVIEW_ARTIST.genres ?? []}
        photoDownloadSizes={[]}
        pressPhotos={[]}
        allowPhotoDownloads={false}
        tourDates={getTourDates(state.id)}
        viewerLocation={getViewerLocation(state.id)}
        resolveNearbyTour={shouldResolveNearbyTour(state.id)}
        showSubscriptionConfirmedBanner={state.showSubscriptionConfirmedBanner}
        drawerOpen={state.drawerView !== null}
        drawerView={state.drawerView ?? 'menu'}
        onDrawerOpenChange={() => {}}
        onDrawerViewChange={() => {}}
        onOpenMenu={() => {}}
        onPlayClick={() => {}}
        onShare={() => {}}
        profileHref={`/${HOMEPAGE_PROFILE_PREVIEW_ARTIST.handle}`}
        artistProfilesHref={APP_ROUTES.ARTIST_PROFILES}
        isSubscribed={
          state.id === 'fans-confirmed' ||
          state.id === 'fans-song-alert' ||
          state.id === 'fans-show-alert' ||
          state.id === 'subscribe-done'
        }
        onTogglePref={() => {}}
        onUnsubscribe={() => {}}
        onManageNotifications={() => {}}
        onRegisterReveal={() => {}}
        onRevealNotifications={() => {}}
        previewNotificationsState={state.notifications}
        previewReleaseActionLabel={state.releaseActionLabel}
        hideJovieBranding={hideJovieBranding}
        hideMoreMenu={hideMoreMenu}
      />
    </div>
  );
}

export function HomeProfileShowcase({
  stateId,
  compact = false,
  className,
  presentation = 'full-phone',
  overlayMode = 'auto',
  cropAnchor = 'center',
  hideJovieBranding = false,
  hideMoreMenu = false,
}: Readonly<HomeProfileShowcaseProps>) {
  const reducedMotion = useReducedMotion();
  const inertRef = useRef<HTMLDivElement>(null);
  const shouldRenderSurface = overlayMode !== 'only';
  const shouldRenderOverlay =
    overlayMode !== 'hidden' &&
    HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId].previewOverlay;

  useEffect(() => {
    const node = inertRef.current;
    if (!node) {
      return;
    }

    node.inert = true;
  }, []);

  let content: ReactNode = null;

  if (presentation === 'full-phone' || presentation === 'beauty-shot') {
    content = (
      <HomePhoneFrame
        compact={compact}
        className='homepage-showcase-phone-frame'
      >
        {shouldRenderSurface ? (
          <ShowcaseSurface
            stateId={stateId}
            hideJovieBranding={hideJovieBranding}
            hideMoreMenu={hideMoreMenu}
          />
        ) : null}
        {shouldRenderOverlay ? (
          <HomeProfileOverlayCard stateId={stateId} mode='absolute' />
        ) : null}
      </HomePhoneFrame>
    );
  } else if (shouldRenderSurface) {
    content = (
      <div className='homepage-showcase-crop-viewport'>
        <div className='homepage-showcase-crop-surface'>
          <ShowcaseSurface
            stateId={stateId}
            hideJovieBranding={hideJovieBranding}
            hideMoreMenu={hideMoreMenu}
          />
        </div>
        {shouldRenderOverlay ? (
          <HomeProfileOverlayCard stateId={stateId} mode='absolute' />
        ) : null}
      </div>
    );
  } else if (shouldRenderOverlay) {
    content = <HomeProfileOverlayCard stateId={stateId} mode='standalone' />;
  }

  return (
    <div
      ref={inertRef}
      aria-hidden='true'
      inert
      data-testid={`homepage-phone-state-${stateId}`}
      data-motion-mode={reducedMotion ? 'reduced' : 'default'}
      data-presentation={presentation}
      data-overlay-mode={overlayMode}
      data-crop-anchor={cropAnchor}
      className={cn(
        'homepage-showcase pointer-events-none select-none',
        reducedMotion ? 'motion-reduce' : 'motion-default',
        className
      )}
    >
      {content}
    </div>
  );
}
