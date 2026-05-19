'use client';

import { BadgeCheck, Bell, ChevronLeft, MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { BottomTabBar } from '@/features/profile/nav/BottomTabBar';
import { ProfileHomeRail } from '@/features/profile/ProfileHomeRail';
import type { ProfilePrimaryActionCardRelease } from '@/features/profile/ProfilePrimaryActionCard';
import { ProfilePrimaryTabPanel } from '@/features/profile/ProfilePrimaryTabPanel';
import type { DrawerView } from '@/features/profile/ProfileUnifiedDrawer';
import { resolveProfileSurfaceState } from '@/features/profile/profile-surface-state';
import { getProfileModeDefinition } from '@/features/profile/registry';
import type { PublicRelease } from '@/features/profile/releases/types';
import { SubscriptionConfirmedBanner } from '@/features/profile/SubscriptionConfirmedBanner';
import type { UserLocation } from '@/hooks/useUserLocation';
import { track } from '@/lib/analytics';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { CONTENT_SAFE_AREA_BOTTOM_PADDING } from '@/lib/profile/nav-constants';
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
import type { NotificationSourceContext } from '../artist-notifications-cta/types';

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

function mapPrimaryTabToAnalyticsTab(
  tab: ProfilePrimaryTab
): NotificationSourceContext['currentTab'] {
  switch (tab) {
    case 'listen':
      return 'music';
    case 'tour':
      return 'events';
    case 'subscribe':
      return 'alerts';
    case 'profile':
    default:
      return 'home';
  }
}

function mapPrimaryTabToAlertIntent(
  tab: ProfilePrimaryTab
): NotificationSourceContext['intent'] {
  switch (tab) {
    case 'listen':
      return 'music_alerts';
    case 'tour':
      return 'event_alerts';
    case 'profile':
    case 'subscribe':
    default:
      return 'general_alerts';
  }
}

function toHomeLatestRelease(
  release: PublicRelease | null | undefined
): ProfilePrimaryActionCardRelease | null {
  if (!release) {
    return null;
  }

  return {
    title: release.title,
    slug: release.slug,
    artworkUrl: release.artworkUrl,
    releaseDate: release.releaseDate,
    releaseType: release.releaseType,
    metadata: {
      artistNames: release.artistNames,
      publicReleaseId: release.id,
    },
  };
}

function getNewestPublicRelease(
  releases: readonly PublicRelease[]
): PublicRelease | null {
  return (
    [...releases].sort((left, right) => {
      const leftTime = left.releaseDate
        ? new Date(left.releaseDate).getTime()
        : Number.NEGATIVE_INFINITY;
      const rightTime = right.releaseDate
        ? new Date(right.releaseDate).getTime()
        : Number.NEGATIVE_INFINITY;

      return rightTime - leftTime;
    })[0] ?? null
  );
}

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
  readonly alertOptInVariant?: ProfileAlertOptInVariant;
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
  readonly renderInteractiveOverlays?: boolean;
  readonly renderSemanticHeading?: boolean;
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
  alertOptInVariant = 'button',
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
    label: 'Get alerts',
  },
  dataTestId,
  hideMoreMenu = false,
  headerSocialLinksOverride,
  renderInteractiveOverlays = true,
  renderSemanticHeading = true,
}: Readonly<ProfileCompactSurfaceProps>) {
  const [notificationsPortalContainer, setNotificationsPortalContainer] =
    useState<HTMLDivElement | null>(null);
  const [showRecentActivationRow, setShowRecentActivationRow] = useState(false);
  const [notificationSourceContext, setNotificationSourceContext] =
    useState<NotificationSourceContext | null>(null);
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
  const hasTourDates = tourDates.length > 0;
  const activeVisiblePrimaryTab = activePrimaryTab;
  const currentAnalyticsTab = mapPrimaryTabToAnalyticsTab(
    activeVisiblePrimaryTab
  );
  const defaultNotificationSourceContext = useMemo<NotificationSourceContext>(
    () => ({
      artistId: artist.id,
      profileId: artist.id,
      profileSlug: artist.handle,
      currentTab: currentAnalyticsTab,
      ctaLocation:
        activeVisiblePrimaryTab === 'subscribe'
          ? 'subscribe_tab'
          : 'hero_alerts_button',
      intent: mapPrimaryTabToAlertIntent(activeVisiblePrimaryTab),
    }),
    [activeVisiblePrimaryTab, artist.handle, artist.id, currentAnalyticsTab]
  );
  const activeNotificationSourceContext =
    notificationSourceContext ?? defaultNotificationSourceContext;
  const isHomeMode = activeVisiblePrimaryTab === 'profile';
  const showBottomNav = true;
  const isPreviewEmbedded =
    renderMode === 'preview' && presentation === 'embedded';
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
        activeSubtitle: getProfileModeDefinition(activeVisiblePrimaryTab)
          .subtitle,
        viewerCountryCode,
      }),
    [
      activeVisiblePrimaryTab,
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
  const IdentityHeading =
    renderMode === 'preview' || !renderSemanticHeading ? 'p' : 'h1';
  const isMenuActive =
    drawerOpen && drawerView === 'menu' && activeVisiblePrimaryTab !== 'tour';
  const topChromeButtonClassName =
    'h-9! w-9! border-white/14 bg-black/24 text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-md hover:bg-black/36 active:scale-100';
  const socialIconClassName =
    'inline-flex h-8 w-8 items-center justify-center text-white/68 transition-colors duration-subtle hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';
  const heroHeightClassName = isHomeMode
    ? 'h-[var(--cover-height)] min-h-[320px] max-h-[500px]'
    : 'h-[calc(3.5rem+max(env(safe-area-inset-top),0px))] border-b border-white/[0.075]';
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
  useEffect(() => {
    if (!isSubscribed) {
      setShowRecentActivationRow(false);
    }
  }, [isSubscribed]);
  const returnToProfileAfterNotifications = useCallback(() => {
    onModeSelect('profile');
  }, [onModeSelect]);
  const openNotifications = useCallback(
    (sourceContext?: NotificationSourceContext) => {
      setNotificationSourceContext(
        sourceContext ?? defaultNotificationSourceContext
      );
      const revealLater = (reveal: () => void) => {
        if (typeof window === 'undefined') {
          reveal();
          return;
        }
        window.setTimeout(reveal, 0);
      };

      const reveal = notificationsRevealRef.current;
      if (reveal) {
        revealLater(reveal);
        return;
      }
      pendingNotificationsOpenRef.current = true;
      onModeSelect('subscribe');
      onRevealNotifications?.();
    },
    [defaultNotificationSourceContext, onModeSelect, onRevealNotifications]
  );
  const handleTabSelect = useCallback(
    (tab: ProfilePrimaryTab) => {
      const nextTab = mapPrimaryTabToAnalyticsTab(tab);
      track('profile_tab_click', {
        artist_id: artist.id,
        profile_id: artist.id,
        profile_slug: artist.handle,
        handle: artist.handle,
        tab: nextTab,
        mode: tab,
        previous_tab: currentAnalyticsTab,
      });
      onModeSelect(tab);
    },
    [artist.handle, artist.id, currentAnalyticsTab, onModeSelect]
  );
  const handleSocialClick = useCallback(
    (link: LegacySocialLink) => {
      track('social_click', {
        artist_id: artist.id,
        profile_id: artist.id,
        profile_slug: artist.handle,
        handle: artist.handle,
        current_route_tab: currentAnalyticsTab,
        platform: link.platform,
        target_url: link.url,
      });
    },
    [artist.handle, artist.id, currentAnalyticsTab]
  );
  const homeAlertsSubscribed = isSubscribed || showRecentActivationRow;
  const shouldRenderInteractiveOverlays =
    renderMode === 'interactive' && renderInteractiveOverlays;
  const homeLatestRelease =
    latestRelease ?? toHomeLatestRelease(getNewestPublicRelease(releases));
  const homeProfileSettings = homeLatestRelease
    ? { ...profileSettings, showOldReleases: true }
    : profileSettings;

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
          <IdentityHeading className='sr-only' data-testid='profile-header'>
            {artist.name}
          </IdentityHeading>
        ) : null}
        <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_34%)]' />

        <header
          className={cn(
            'relative shrink-0 overflow-hidden',
            heroHeightClassName
          )}
          data-testid='profile-cover'
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
                    className='object-cover object-[50%_34%]'
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

              <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,3,4,0.04)_0%,rgba(2,3,4,0.12)_36%,rgba(3,4,6,0.38)_68%,rgba(5,6,8,0.9)_92%,var(--profile-stage-bg)_100%)]' />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.48)_38%,rgba(0,0,0,0.84)_74%,var(--profile-stage-bg)_100%)]' />
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
                onClick={() => openNotifications()}
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
            <div className='absolute inset-x-0 bottom-0 z-10 px-[var(--page-pad)] pb-5'>
              <div
                className='min-w-0 px-0 py-0 [overflow-wrap:anywhere]'
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
                    className='inline-flex max-w-full min-w-0 flex-wrap items-center gap-1.5 rounded-md text-[clamp(28px,8vw,34px)] font-semibold leading-[0.98] tracking-[-0.026em] text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent [@media(max-height:820px)]:text-[30px] [@media(max-height:760px)]:text-[28px]'
                  >
                    <span className='min-w-0 max-w-full [overflow-wrap:anywhere]'>
                      {artist.name}
                    </span>
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

                <p className='mt-1 line-clamp-2 min-w-0 text-[13px] font-medium leading-5 tracking-[-0.012em] text-white/76 [overflow-wrap:anywhere] [@media(max-height:820px)]:text-[12px]'>
                  {heroSubtitle}
                </p>

                <div className='flex min-w-0 items-center justify-between gap-3 pt-1 [@media(max-height:820px)]:pt-0'>
                  {locationLabel ? (
                    <p className='inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-white/78 [overflow-wrap:anywhere] [@media(max-height:820px)]:text-[12px]'>
                      <MapPin className='h-3.5 w-3.5 shrink-0' />
                      <span className='min-w-0 [overflow-wrap:anywhere]'>
                        {locationLabel}
                      </span>
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
                            onClick={() => handleSocialClick(link)}
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

        <div
          className={cn(
            'relative z-10 flex min-h-0 flex-1 flex-col px-[var(--page-pad)]',
            isHomeMode ? 'pt-0' : 'pt-2'
          )}
        >
          {shouldRenderInteractiveOverlays ? (
            <ProfileInlineNotificationsCTA
              artist={artist}
              onManageNotifications={onManageNotifications}
              onRegisterReveal={registerNotificationsReveal}
              portalContainer={notificationsPortalContainer ?? undefined}
              variant='hero'
              autoOpen={activeVisiblePrimaryTab === 'subscribe'}
              hideTrigger
              experimentVariant={alertOptInVariant}
              source={activeNotificationSourceContext.ctaLocation}
              sourceContext={activeNotificationSourceContext}
              onFlowClosed={returnToProfileAfterNotifications}
              onSubscriptionActivated={handleSubscriptionActivated}
            />
          ) : null}

          {isHomeMode ? <div className='shrink-0 pb-2' /> : null}

          {showSubscriptionConfirmedBanner ? (
            <div className='shrink-0 pb-3'>
              <SubscriptionConfirmedBanner />
            </div>
          ) : null}

          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [touch-action:pan-y] [will-change:scroll-position]',
              showBottomNav ? CONTENT_SAFE_AREA_BOTTOM_PADDING : 'pb-0',
              !isHomeMode &&
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
            )}
            data-testid='profile-content-scroll'
            tabIndex={isHomeMode ? undefined : 0}
          >
            {isHomeMode ? (
              <ProfileHomeRail
                artist={artist}
                latestRelease={homeLatestRelease}
                profileSettings={homeProfileSettings}
                featuredPlaylistFallback={featuredPlaylistFallback}
                tourDates={tourDates}
                hasPlayableDestinations={mergedDSPs.length > 0}
                renderMode={renderMode}
                onPlayClick={onPlayClick}
                onAlertsClick={openNotifications}
                isSubscribed={homeAlertsSubscribed}
                viewerLocation={viewerLocation}
                resolveNearbyTour={resolveNearbyTour}
              />
            ) : (
              <ProfilePrimaryTabPanel
                mode={activeVisiblePrimaryTab}
                renderMode={renderMode}
                artist={artist}
                notificationsPortalContainer={
                  notificationsPortalContainer ?? undefined
                }
                dsps={mergedDSPs}
                enableDynamicEngagement={enableDynamicEngagement}
                subscribeTwoStep={subscribeTwoStep}
                alertOptInVariant={alertOptInVariant}
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
                alertSourceContext={defaultNotificationSourceContext}
                previewNotificationsState={previewNotificationsState}
                onFlowClosed={returnToProfileAfterNotifications}
                onSubscriptionActivated={handleSubscriptionActivated}
              />
            )}
          </div>

          {showBottomNav ? (
            <BottomTabBar
              activeTab={activeVisiblePrimaryTab}
              hasTourDates={hasTourDates}
              hideMoreMenu={hideMoreMenu}
              isMenuOpen={isMenuActive}
              onTabSelect={handleTabSelect}
              onOpenMenu={onOpenMenu}
            />
          ) : null}
        </div>
      </div>

      {renderMode !== 'preview' && renderInteractiveOverlays ? (
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
          hasTourDates={hasTourDates}
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
