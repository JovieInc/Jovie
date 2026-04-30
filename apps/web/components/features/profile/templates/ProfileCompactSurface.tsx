'use client';

import {
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronLeft,
  type LucideIcon,
  MapPin,
  MoreHorizontal,
  Music2,
  UserRound,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import type {
  ProfileMode,
  ProfilePreviewNotificationsState,
  ProfilePrimaryTab,
  ProfileRenderMode,
  ProfileSurfacePresentation,
} from '@/features/profile/contracts';
import { ProfileHomeRail } from '@/features/profile/ProfileHomeRail';
import type { ProfilePrimaryActionCardRelease } from '@/features/profile/ProfilePrimaryActionCard';
import { ProfilePrimaryTabPanel } from '@/features/profile/ProfilePrimaryTabPanel';
import type { DrawerView } from '@/features/profile/ProfileUnifiedDrawer';
import { resolveProfileSurfaceState } from '@/features/profile/profile-surface-state';
import { getProfileModeDefinition } from '@/features/profile/registry';
import type { PublicRelease } from '@/features/profile/releases/types';
import { SubscriptionConfirmedBanner } from '@/features/profile/SubscriptionConfirmedBanner';
import type { UserLocation } from '@/hooks/useUserLocation';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import { buildProfileShareContext } from '@/lib/share/context';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import { isDefaultAvatarUrl } from '@/lib/utils/dsp-images';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';

const ProfileUnifiedDrawer = dynamic(() =>
  import('@/features/profile/ProfileUnifiedDrawer').then(mod => ({
    default: mod.ProfileUnifiedDrawer,
  }))
);

const ProfileInlineNotificationsCTA = dynamic(() =>
  import(
    '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
  ).then(mod => ({
    default: mod.ProfileInlineNotificationsCTA,
  }))
);

const DEFAULT_CONTENT_PREFS: Record<NotificationContentType, boolean> = {
  newMusic: true,
  tourDates: true,
  merch: true,
  general: true,
};

const PRIMARY_TABS: ReadonlyArray<{
  mode: ProfilePrimaryTab;
  label: string;
  icon: LucideIcon;
}> = [
  { mode: 'profile', label: 'Home', icon: UserRound },
  { mode: 'listen', label: 'Music', icon: Music2 },
  { mode: 'tour', label: 'Events', icon: CalendarDays },
  { mode: 'subscribe', label: 'Alerts', icon: Bell },
];

interface ProfileCompactSurfaceProps {
  readonly renderMode?: ProfileRenderMode;
  readonly presentation?: ProfileSurfacePresentation;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly showPayButton?: boolean;
  readonly latestRelease?: ProfilePrimaryActionCardRelease | null;
  readonly profileSettings?: {
    readonly showOldReleases?: boolean;
  } | null;
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly tourDates?: TourDateViewModel[];
  readonly showSubscriptionConfirmedBanner?: boolean;
  readonly viewerCountryCode?: string | null;
  readonly viewerLocation?: UserLocation | null;
  readonly resolveNearbyTour?: boolean;
  readonly releases?: readonly PublicRelease[];
  readonly drawerOpen: boolean;
  readonly drawerView: DrawerView;
  readonly activeMode?: ProfileMode;
  readonly onModeSelect?: (mode: ProfilePrimaryTab) => void;
  readonly onDrawerOpenChange: (open: boolean) => void;
  readonly onDrawerViewChange: (view: DrawerView) => void;
  readonly onBack: () => void;
  readonly onOpenMenu: () => void;
  readonly onPlayClick: () => void;
  readonly onShare: () => void;
  readonly profileHref: string;
  readonly artistProfilesHref?: string;
  readonly isSubscribed?: boolean;
  readonly contentPrefs?: Record<NotificationContentType, boolean>;
  readonly onTogglePref?: (key: NotificationContentType) => void;
  readonly onUnsubscribe?: () => void;
  readonly isUnsubscribing?: boolean;
  readonly onManageNotifications?: () => void;
  readonly onRegisterReveal?: (reveal: () => void) => void;
  readonly onRevealNotifications?: () => void;
  readonly previewNotificationsState?: ProfilePreviewNotificationsState;
  readonly previewReleaseActionLabel?: string;
  readonly dataTestId?: string;
  readonly hideJovieBranding?: boolean;
  readonly hideMoreMenu?: boolean;
  readonly headerSocialLinksOverride?: readonly LegacySocialLink[];
}

function resolveActivePrimaryTab(params: {
  readonly mode: ProfileMode;
  readonly drawerOpen: boolean;
  readonly drawerView: DrawerView;
}): ProfilePrimaryTab {
  if (params.drawerOpen) {
    switch (params.drawerView) {
      case 'listen':
      case 'releases':
        return 'listen';
      case 'tour':
        return 'tour';
      case 'subscribe':
      case 'notifications':
        return 'subscribe';
      default:
        return 'profile';
    }
  }

  const { mode } = params;
  switch (mode) {
    case 'listen':
    case 'releases':
      return 'listen';
    case 'tour':
    case 'subscribe':
      return mode;
    case 'profile':
    case 'about':
    case 'pay':
    case 'contact':
    default:
      return 'profile';
  }
}

export function ProfileCompactSurface({
  renderMode = 'interactive',
  presentation = 'standalone',
  artist,
  socialLinks,
  contacts,
  showPayButton = true,
  latestRelease,
  profileSettings,
  featuredPlaylistFallback,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  photoDownloadSizes = [],
  tourDates = [],
  showSubscriptionConfirmedBanner = false,
  viewerCountryCode,
  viewerLocation,
  resolveNearbyTour = true,
  releases = [],
  drawerOpen,
  drawerView,
  activeMode = 'profile',
  onModeSelect = () => {},
  onDrawerOpenChange,
  onDrawerViewChange,
  onBack,
  onOpenMenu,
  onPlayClick,
  profileHref,
  isSubscribed = false,
  contentPrefs = DEFAULT_CONTENT_PREFS,
  onTogglePref = () => {},
  onUnsubscribe = () => {},
  isUnsubscribing = false,
  onManageNotifications,
  onRegisterReveal,
  onRevealNotifications,
  previewNotificationsState = {
    kind: 'button',
    tone: 'quiet',
    label: 'Turn on alerts',
  },
  dataTestId,
  hideMoreMenu = false,
  headerSocialLinksOverride,
}: Readonly<ProfileCompactSurfaceProps>) {
  const [notificationsPortalContainer, setNotificationsPortalContainer] =
    useState<HTMLDivElement | null>(null);
  const [showRecentActivationRow, setShowRecentActivationRow] = useState(false);
  const notificationsRevealRef = useRef<(() => void) | null>(null);
  const pendingNotificationsOpenRef = useRef(false);
  const mergedDSPs = useMemo(
    () =>
      sortDSPsByGeoPopularity(
        getCanonicalProfileDSPs(artist, socialLinks),
        viewerCountryCode
      ),
    [artist, socialLinks, viewerCountryCode]
  );
  const {
    available: availableContacts,
    primaryChannel,
    isEnabled: hasContacts,
  } = useArtistContacts({
    contacts,
    artistHandle: artist.handle,
  });
  const isDrawerOverlayActive = renderMode === 'interactive' && drawerOpen;
  const activePrimaryTab = resolveActivePrimaryTab({
    mode: activeMode,
    drawerOpen: isDrawerOverlayActive,
    drawerView,
  });
  const isHomeMode = activePrimaryTab === 'profile';
  const showBottomNav = true;
  const isPreviewEmbedded =
    renderMode === 'preview' && presentation === 'embedded';
  const activePrimaryPanel = isHomeMode ? null : activePrimaryTab;
  const surfaceState = useMemo(
    () =>
      resolveProfileSurfaceState({
        artist,
        socialLinks,
        photoDownloadSizes,
        latestRelease,
        profileSettings,
        featuredPlaylistFallback,
        tourDates,
        releases,
        hasPlayableDestinations: mergedDSPs.length > 0,
        showPayButton,
        isSubscribed,
        activeSubtitle: getProfileModeDefinition(activePrimaryTab).subtitle,
        viewerCountryCode,
      }),
    [
      activePrimaryTab,
      artist,
      featuredPlaylistFallback,
      isSubscribed,
      latestRelease,
      mergedDSPs.length,
      photoDownloadSizes,
      profileSettings,
      releases,
      showPayButton,
      socialLinks,
      tourDates,
      viewerCountryCode,
    ]
  );
  const heroImageUrl = surfaceState.heroImageUrl;
  const resolvedHeroImageUrl = useMemo(() => {
    const imageUrl = heroImageUrl ?? artist.image_url ?? null;
    return isDefaultAvatarUrl(imageUrl) ? null : imageUrl;
  }, [artist.image_url, heroImageUrl]);
  const visibleSocialLinks = headerSocialLinksOverride
    ? [...headerSocialLinksOverride]
    : surfaceState.visibleSocialLinks;
  const shareContext = useMemo(
    () =>
      buildProfileShareContext({
        username: artist.handle,
        artistName: artist.name,
        avatarUrl: resolvedHeroImageUrl,
      }),
    [artist.handle, artist.name, resolvedHeroImageUrl]
  );
  const hasTip = surfaceState.hasTip;
  const hasReleases = surfaceState.hasReleases;
  const { heroSubtitle } = surfaceState;
  const IdentityHeading = renderMode === 'preview' ? 'p' : 'h1';
  const isMenuActive = drawerOpen && drawerView === 'menu';
  const topChromeButtonClassName =
    'h-9! w-9! border-white/14 bg-black/24 text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-md hover:bg-black/36 active:scale-100';
  const socialIconClassName =
    'inline-flex h-8 w-8 items-center justify-center rounded-full text-white/82 transition-colors duration-200 hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';
  const heroHeightClassName = isHomeMode
    ? 'h-[34svh] min-h-[232px] max-h-[250px] [@media(min-height:761px)_and_(max-height:880px)]:max-h-[190px] [@media(min-height:761px)_and_(max-height:880px)]:min-h-[190px] [@media(max-height:760px)]:h-[156px] [@media(max-height:760px)]:min-h-[156px]'
    : 'h-14 border-b border-white/[0.075]';
  const locationLabel = artist.location?.trim() || artist.hometown?.trim();
  const registerNotificationsReveal = useCallback(
    (reveal: () => void) => {
      notificationsRevealRef.current = reveal;
      onRegisterReveal?.(reveal);

      if (pendingNotificationsOpenRef.current) {
        pendingNotificationsOpenRef.current = false;
        reveal();
      }
    },
    [onRegisterReveal]
  );
  const handleSubscriptionActivated = useCallback(() => {
    setShowRecentActivationRow(true);
  }, []);
  const returnToProfileAfterNotifications = useCallback(() => {
    onModeSelect('profile');
  }, [onModeSelect]);
  const openNotifications = useCallback(() => {
    const reveal = notificationsRevealRef.current;
    if (reveal) {
      reveal();
      return;
    }
    pendingNotificationsOpenRef.current = true;
    onModeSelect('subscribe');
    onRevealNotifications?.();
  }, [onModeSelect, onRevealNotifications]);
  const showHeroAlertsRow = !isSubscribed || showRecentActivationRow;

  return (
    <div
      className='relative h-full w-full'
      data-testid={dataTestId}
      data-render-mode={renderMode}
      data-profile-mode={activeMode}
    >
      <div
        ref={setNotificationsPortalContainer}
        className='relative flex h-full w-full flex-col overflow-hidden bg-[color:var(--profile-content-bg)]'
        data-testid='profile-compact-surface'
        data-presentation={presentation}
      >
        {!isHomeMode && renderMode !== 'preview' ? (
          <h1 className='sr-only'>{artist.name}</h1>
        ) : null}
        <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_34%)]' />

        <header
          className={cn(
            'relative shrink-0 overflow-hidden',
            heroHeightClassName
          )}
        >
          {isHomeMode ? (
            <>
              <div className='absolute inset-0'>
                {resolvedHeroImageUrl ? (
                  <ImageWithFallback
                    src={resolvedHeroImageUrl}
                    alt={artist.name}
                    fill
                    priority
                    sizes='(max-width: 767px) 100vw, 430px'
                    className='object-cover object-center'
                    fallbackVariant='avatar'
                    fallbackClassName='bg-surface-2'
                  />
                ) : (
                  <div
                    className='h-full w-full bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.08),transparent_28%),linear-gradient(145deg,#20242c_0%,#11141a_48%,#050608_100%)]'
                    aria-hidden='true'
                  />
                )}
              </div>

              <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,3,4,0.08)_0%,rgba(2,3,4,0.12)_26%,rgba(3,4,6,0.34)_58%,rgba(5,6,8,0.9)_84%,var(--profile-stage-bg)_100%)]' />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,var(--profile-stage-bg)_92%)]' />
            </>
          ) : (
            <div className='absolute inset-0 bg-black/94 backdrop-blur-2xl' />
          )}

          <div
            className={cn(
              'relative z-10 flex h-full items-start justify-between px-4',
              isPreviewEmbedded
                ? 'pt-[74px]'
                : isHomeMode
                  ? 'pt-[max(env(safe-area-inset-top),16px)]'
                  : 'pt-[max(env(safe-area-inset-top),10px)]'
            )}
          >
            <div
              className='flex w-full items-start justify-between'
              data-testid='profile-top-chrome'
            >
              <CircleIconButton
                onClick={onBack}
                size='lg'
                variant='pearl'
                className={topChromeButtonClassName}
                ariaLabel='Back'
              >
                <ChevronLeft className='h-[18px] w-[18px]' />
              </CircleIconButton>

              {!isHomeMode ? (
                <p
                  className='absolute left-14 right-14 top-[max(env(safe-area-inset-top),14px)] truncate text-center text-[14px] font-semibold tracking-[-0.012em] text-white'
                  data-testid={
                    renderMode === 'preview' ? undefined : 'profile-header'
                  }
                >
                  {artist.name}
                </p>
              ) : null}

              <CircleIconButton
                onClick={openNotifications}
                size='lg'
                variant='pearl'
                className={topChromeButtonClassName}
                ariaLabel='Alerts'
              >
                <Bell className='h-4 w-4' />
              </CircleIconButton>
            </div>
          </div>

          {isHomeMode ? (
            <div className='absolute inset-x-0 bottom-0 z-10 px-4 pb-4 [@media(max-height:820px)]:pb-3'>
              <div
                className='min-w-0 space-y-1'
                data-testid='profile-hero-identity-block'
              >
                <IdentityHeading
                  className='min-w-0'
                  data-testid={
                    renderMode === 'preview' ? undefined : 'profile-header'
                  }
                >
                  <Link
                    data-testid='profile-identity-link'
                    href={profileHref}
                    aria-label={`Go to ${artist.name}'s profile`}
                    className='inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md text-[36px] font-semibold leading-[0.98] tracking-[-0.026em] text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent [@media(max-height:820px)]:text-[32px] [@media(max-height:760px)]:text-[31px]'
                  >
                    <span className='truncate'>{artist.name}</span>
                    {artist.is_verified ? (
                      <BadgeCheck
                        className='h-5 w-5 shrink-0 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4'
                        fill='white'
                        stroke='black'
                        strokeWidth={2}
                        aria-label='Verified'
                      />
                    ) : null}
                  </Link>
                </IdentityHeading>

                <p className='line-clamp-1 text-[13px] font-medium leading-5 tracking-[-0.012em] text-white/76 [@media(max-height:820px)]:text-[12px]'>
                  {heroSubtitle}
                </p>

                <div className='flex min-w-0 items-center justify-between gap-3 pt-1 [@media(max-height:820px)]:pt-0'>
                  {locationLabel ? (
                    <p className='inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-white/78 [@media(max-height:820px)]:text-[12px]'>
                      <MapPin className='h-3.5 w-3.5 shrink-0' />
                      <span className='truncate'>{locationLabel}</span>
                    </p>
                  ) : (
                    <span />
                  )}

                  {visibleSocialLinks.length > 0 ? (
                    <div
                      className='flex shrink-0 items-center gap-2'
                      data-testid='profile-hero-social-row'
                    >
                      {visibleSocialLinks.map(link =>
                        link.platform && link.url ? (
                          <a
                            key={link.id}
                            href={link.url}
                            target='_blank'
                            rel='noopener noreferrer'
                            className={socialIconClassName}
                            aria-label={link.platform}
                          >
                            <SocialIcon
                              platform={link.platform}
                              className='h-[18px] w-[18px]'
                            />
                          </a>
                        ) : null
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </header>

        <div className='relative z-10 flex min-h-0 flex-1 flex-col px-4 pt-2'>
          {isHomeMode ? (
            <div className='shrink-0 space-y-2 pb-2'>
              {renderMode === 'interactive' ? (
                <ProfileInlineNotificationsCTA
                  artist={artist}
                  onManageNotifications={onManageNotifications}
                  onRegisterReveal={registerNotificationsReveal}
                  portalContainer={notificationsPortalContainer ?? undefined}
                  variant='hero'
                  hideTrigger
                  onFlowClosed={returnToProfileAfterNotifications}
                  onSubscriptionActivated={handleSubscriptionActivated}
                />
              ) : null}

              {showHeroAlertsRow ? (
                <button
                  type='button'
                  onClick={openNotifications}
                  disabled={renderMode !== 'interactive'}
                  className='flex min-h-11 w-full items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.035] px-3 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_28px_-18px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-[background-color,border-color] duration-200 hover:bg-white/[0.055] disabled:cursor-default disabled:hover:bg-white/[0.035] [@media(max-height:820px)]:hidden'
                  data-testid='profile-hero-alerts-row'
                >
                  <span
                    className='flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/8 bg-white/[0.045] text-white'
                    aria-hidden='true'
                  >
                    <Bell className='h-4 w-4' />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-[13px] font-semibold leading-5 tracking-[-0.01em]'>
                      {isSubscribed ? 'Alerts On' : 'Alerts Off'}
                    </span>
                    <span className='block truncate text-[11.5px] leading-4 text-white/52'>
                      New music, events and merch.
                    </span>
                  </span>
                  <span
                    className={cn(
                      'relative h-[26px] w-[42px] shrink-0 rounded-full border p-0.5 transition-colors duration-200',
                      isSubscribed
                        ? 'border-white/42 bg-white'
                        : 'border-white/16 bg-white/10'
                    )}
                    aria-hidden='true'
                  >
                    <span
                      className={cn(
                        'block h-[22px] w-[22px] rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.22)] transition-transform duration-200',
                        isSubscribed
                          ? 'translate-x-4 bg-black'
                          : 'translate-x-0 bg-white'
                      )}
                    />
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}

          {showSubscriptionConfirmedBanner ? (
            <div className='shrink-0 pb-3'>
              <SubscriptionConfirmedBanner />
            </div>
          ) : null}

          <div
            className={cn(
              'min-h-0 flex-1',
              showBottomNav ? 'pb-4' : 'pb-0',
              !isHomeMode &&
                'overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            )}
          >
            {isHomeMode ? (
              <ProfileHomeRail
                artist={artist}
                latestRelease={latestRelease}
                profileSettings={profileSettings}
                featuredPlaylistFallback={featuredPlaylistFallback}
                tourDates={tourDates}
                hasPlayableDestinations={mergedDSPs.length > 0}
                renderMode={renderMode}
                onPlayClick={onPlayClick}
                viewerLocation={viewerLocation}
                resolveNearbyTour={resolveNearbyTour}
              />
            ) : (
              <ProfilePrimaryTabPanel
                mode={activePrimaryPanel ?? 'listen'}
                renderMode={renderMode}
                artist={artist}
                notificationsPortalContainer={
                  notificationsPortalContainer ?? undefined
                }
                dsps={mergedDSPs}
                enableDynamicEngagement={enableDynamicEngagement}
                subscribeTwoStep={subscribeTwoStep}
                isSubscribed={isSubscribed}
                contentPrefs={contentPrefs}
                onTogglePref={onTogglePref}
                onUnsubscribe={onUnsubscribe}
                isUnsubscribing={isUnsubscribing}
                genres={genres}
                pressPhotos={pressPhotos}
                allowPhotoDownloads={allowPhotoDownloads}
                tourDates={tourDates}
                releases={releases}
                previewNotificationsState={previewNotificationsState}
                onFlowClosed={returnToProfileAfterNotifications}
                onSubscriptionActivated={handleSubscriptionActivated}
              />
            )}
          </div>

          {showBottomNav ? (
            <div className='-mx-4 shrink-0 border-t border-white/[0.075] bg-black/72 px-1 pb-[max(env(safe-area-inset-bottom),10px)] pt-1 backdrop-blur-2xl'>
              <nav
                className='px-0 py-1'
                aria-label='Profile navigation'
                data-testid='profile-bottom-nav'
              >
                <div
                  className={cn(
                    'grid items-center gap-1',
                    hideMoreMenu ? 'grid-cols-4' : 'grid-cols-5'
                  )}
                >
                  {PRIMARY_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive =
                      !isMenuActive && tab.mode === activePrimaryTab;
                    return (
                      <button
                        key={tab.mode}
                        type='button'
                        onClick={() => onModeSelect(tab.mode)}
                        className={cn(
                          'relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-[22px] px-1.5 py-1.5 text-center transition-[background-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                          isActive
                            ? 'text-white'
                            : 'text-white/40 hover:text-white/62'
                        )}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon
                          className={cn(
                            'h-5 w-5 shrink-0',
                            isActive ? 'text-white' : 'text-white/52'
                          )}
                        />
                        <span
                          className={cn(
                            'truncate text-[11px] leading-none tracking-[-0.012em]',
                            isActive ? 'font-semibold' : 'font-medium'
                          )}
                        >
                          {tab.label}
                        </span>
                      </button>
                    );
                  })}
                  {!hideMoreMenu ? (
                    <button
                      type='button'
                      onClick={onOpenMenu}
                      className={cn(
                        'relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-[22px] px-1.5 py-1.5 text-center transition-[background-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                        isMenuActive
                          ? 'text-white'
                          : 'text-white/40 hover:text-white/62'
                      )}
                      aria-haspopup='dialog'
                      aria-expanded={isMenuActive}
                    >
                      <MoreHorizontal
                        className={cn(
                          'h-5 w-5 shrink-0',
                          isMenuActive ? 'text-white' : 'text-white/52'
                        )}
                      />
                      <span
                        className={cn(
                          'truncate text-[11px] leading-none tracking-[-0.012em]',
                          isMenuActive ? 'font-semibold' : 'font-medium'
                        )}
                      >
                        More
                      </span>
                    </button>
                  ) : null}
                </div>
              </nav>
            </div>
          ) : null}
        </div>
      </div>

      {renderMode !== 'preview' ? (
        <ProfileUnifiedDrawer
          open={drawerOpen}
          onOpenChange={onDrawerOpenChange}
          view={drawerView}
          presentation={presentation}
          onViewChange={onDrawerViewChange}
          shareContext={shareContext}
          artist={artist}
          socialLinks={socialLinks}
          contacts={availableContacts}
          primaryChannel={primaryChannel}
          dsps={mergedDSPs}
          isSubscribed={isSubscribed}
          contentPrefs={contentPrefs}
          onTogglePref={onTogglePref}
          onUnsubscribe={onUnsubscribe}
          isUnsubscribing={isUnsubscribing}
          enableDynamicEngagement={enableDynamicEngagement}
          subscribeTwoStep={subscribeTwoStep}
          hasTip={hasTip}
          hasContacts={hasContacts}
          hasReleases={hasReleases}
          genres={genres}
          pressPhotos={pressPhotos}
          allowPhotoDownloads={allowPhotoDownloads}
          tourDates={tourDates}
          releases={releases}
        />
      ) : null}
    </div>
  );
}
