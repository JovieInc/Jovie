'use client';

import {
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronLeft,
  House,
  type LucideIcon,
  MoreHorizontal,
  Music2,
  UserRound,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
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
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';

const ProfileUnifiedDrawer = dynamic(
  () =>
    import('@/features/profile/ProfileUnifiedDrawer').then(mod => ({
      default: mod.ProfileUnifiedDrawer,
    })),
  { ssr: false }
);

const ProfileInlineNotificationsCTA = dynamic(
  () =>
    import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    ).then(mod => ({
      default: mod.ProfileInlineNotificationsCTA,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid='profile-inline-cta-placeholder'
        className='min-h-[116px]'
        aria-hidden='true'
      />
    ),
  }
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
  { mode: 'profile', label: 'Home', icon: House },
  { mode: 'listen', label: 'Music', icon: Music2 },
  { mode: 'tour', label: 'Events', icon: CalendarDays },
  { mode: 'subscribe', label: 'Alerts', icon: Bell },
  { mode: 'about', label: 'Profile', icon: UserRound },
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
    case 'tour':
    case 'subscribe':
    case 'about':
      return mode === 'releases' ? 'listen' : mode;
    case 'profile':
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
}: Readonly<ProfileCompactSurfaceProps>) {
  const [notificationsPortalContainer, setNotificationsPortalContainer] =
    useState<HTMLDivElement | null>(null);
  const notificationsRevealRef = useRef<(() => void) | null>(null);
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
  const showBottomNav = activePrimaryTab !== 'subscribe';
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
  const shareContext = useMemo(
    () =>
      buildProfileShareContext({
        username: artist.handle,
        artistName: artist.name,
        avatarUrl: heroImageUrl,
      }),
    [artist.handle, artist.name, heroImageUrl]
  );
  const hasTip = surfaceState.hasTip;
  const hasReleases = surfaceState.hasReleases;
  const { heroSubtitle } = surfaceState;
  const IdentityHeading = renderMode === 'preview' ? 'p' : 'h1';
  const topChromeButtonClassName =
    'h-12! w-12! border-transparent bg-black/44 text-white shadow-[0_20px_44px_rgba(0,0,0,0.34)] backdrop-blur-md hover:bg-black/56';
  const registerNotificationsReveal = useCallback(
    (reveal: () => void) => {
      notificationsRevealRef.current = reveal;
      onRegisterReveal?.(reveal);
    },
    [onRegisterReveal]
  );
  const openNotifications = useCallback(() => {
    const reveal = notificationsRevealRef.current;
    if (reveal) {
      reveal();
    } else {
      onModeSelect('subscribe');
    }
    onRevealNotifications?.();
  }, [onModeSelect, onRevealNotifications]);

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
        <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />

        <header
          className={cn(
            'relative shrink-0 overflow-hidden',
            isHomeMode
              ? isPreviewEmbedded
                ? 'min-h-[408px]'
                : 'min-h-[408px]'
              : isPreviewEmbedded
                ? 'min-h-[316px]'
                : 'min-h-[408px]'
          )}
        >
          <div className='absolute inset-0'>
            {(heroImageUrl ?? artist.image_url) ? (
              <ImageWithFallback
                src={heroImageUrl ?? artist.image_url}
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
                className='h-full w-full bg-[radial-gradient(circle_at_50%_22%,var(--profile-stage-glow-a),transparent_28%),linear-gradient(145deg,#20242c_0%,#11141a_48%,#050608_100%)]'
                aria-hidden='true'
              />
            )}
          </div>

          <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,3,4,0.18)_0%,rgba(3,4,6,0.22)_20%,rgba(4,5,7,0.42)_52%,rgba(5,6,8,0.94)_100%)]' />
          <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,var(--profile-stage-glow-a),transparent_24%),linear-gradient(180deg,transparent_0%,rgba(5,6,8,0.18)_58%,var(--profile-stage-bg)_100%)]' />

          <div
            className={cn(
              'relative z-10 flex h-full flex-col justify-between px-5 pb-6',
              isPreviewEmbedded
                ? 'pt-[74px]'
                : 'pt-[max(env(safe-area-inset-top),20px)]'
            )}
          >
            <div
              className='flex items-center justify-between'
              data-testid='profile-top-chrome'
            >
              <CircleIconButton
                onClick={onBack}
                size='lg'
                variant='pearl'
                className={topChromeButtonClassName}
                ariaLabel='Back'
              >
                <ChevronLeft className='h-5 w-5' />
              </CircleIconButton>

              {!hideMoreMenu ? (
                <CircleIconButton
                  onClick={onOpenMenu}
                  size='lg'
                  variant='pearl'
                  className={cn(
                    topChromeButtonClassName,
                    drawerOpen && 'bg-black/60'
                  )}
                  ariaLabel='More options'
                  aria-haspopup='dialog'
                >
                  <MoreHorizontal className='h-5 w-5' />
                </CircleIconButton>
              ) : null}
            </div>

            <div
              className={cn(isPreviewEmbedded ? 'space-y-3.5' : 'space-y-4')}
            >
              <div
                className={cn(isPreviewEmbedded ? 'space-y-1.5' : 'space-y-2')}
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
                    className={cn(
                      'inline-flex min-w-0 items-center gap-1.5 rounded-md font-semibold leading-[1.02] tracking-[-0.035em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                      isPreviewEmbedded ? 'text-[38px]' : 'text-[34px]'
                    )}
                  >
                    <span className='truncate'>{artist.name}</span>
                    {artist.is_verified ? (
                      <BadgeCheck
                        className='h-5 w-5 shrink-0 drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)]'
                        fill='#3b82f6'
                        stroke='white'
                        strokeWidth={2}
                        aria-label='Verified'
                      />
                    ) : null}
                  </Link>
                </IdentityHeading>

                <p
                  className={cn(
                    'line-clamp-2 max-w-[30ch] font-medium tracking-[-0.012em] text-white/76',
                    isPreviewEmbedded
                      ? 'text-[15px] leading-5'
                      : 'text-sm leading-6'
                  )}
                >
                  {heroSubtitle}
                </p>
              </div>

              <div className='space-y-3'>
                {renderMode === 'interactive' ? (
                  <ProfileInlineNotificationsCTA
                    artist={artist}
                    onManageNotifications={onManageNotifications}
                    onRegisterReveal={registerNotificationsReveal}
                    portalContainer={notificationsPortalContainer}
                    variant='hero'
                    hideTrigger
                  />
                ) : null}

                <button
                  type='button'
                  onClick={openNotifications}
                  disabled={renderMode !== 'interactive'}
                  className='flex min-h-[72px] w-full items-center gap-3 rounded-[22px] border border-white/10 bg-black/28 px-4 text-left text-white shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition-[background-color,border-color] duration-200 hover:bg-black/36 disabled:cursor-default disabled:hover:bg-black/28'
                  data-testid='profile-hero-alerts-row'
                >
                  <span
                    className='flex h-11 w-11 shrink-0 items-center justify-center text-white'
                    aria-hidden='true'
                  >
                    <Bell className='h-6 w-6' />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block text-[16px] font-semibold leading-5 tracking-[-0.03em]'>
                      {isSubscribed ? 'Alerts On' : 'Alerts Off'}
                    </span>
                    <span className='mt-1 block truncate text-[13px] leading-5 text-white/68'>
                      Get notified about new music, shows and more.
                    </span>
                  </span>
                  <span
                    className={cn(
                      'relative h-9 w-[58px] shrink-0 rounded-full border p-0.5 transition-colors duration-200',
                      isSubscribed
                        ? 'border-[color:var(--profile-accent-primary)] bg-[color:var(--profile-accent-soft-strong)]'
                        : 'border-white/20 bg-white/8'
                    )}
                    aria-hidden='true'
                  >
                    <span
                      className={cn(
                        'block h-8 w-8 rounded-full bg-white shadow-[0_8px_20px_rgba(0,0,0,0.25)] transition-transform duration-200',
                        isSubscribed && 'translate-x-[22px]'
                      )}
                    />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className='relative z-10 flex min-h-0 flex-1 flex-col px-5 pt-4'>
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
                notificationsPortalContainer={notificationsPortalContainer}
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
              />
            )}
          </div>

          {showBottomNav ? (
            <div className='shrink-0 pt-1'>
              <nav
                className='mx-[-20px] border-t border-[color:var(--profile-dock-border)] bg-[color:color-mix(in_srgb,var(--profile-dock-bg)_72%,transparent)] px-3 pt-2 backdrop-blur-2xl'
                aria-label='Profile navigation'
                data-testid='profile-bottom-nav'
              >
                <div className='flex items-start gap-1 pb-6'>
                  {PRIMARY_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = tab.mode === activePrimaryTab;
                    return (
                      <button
                        key={tab.mode}
                        type='button'
                        onClick={() => onModeSelect(tab.mode)}
                        className={cn(
                          'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5 text-center transition-[background-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                          isActive
                            ? 'text-white'
                            : 'text-white/40 hover:text-white/62'
                        )}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {isActive ? (
                          <span
                            className='absolute left-1/2 top-0 h-1 w-9 -translate-x-1/2 rounded-full bg-[color:var(--profile-tab-active-bg)]'
                            aria-hidden='true'
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            'h-5 w-5 shrink-0',
                            isActive ? 'text-white' : 'text-white/52'
                          )}
                        />
                        <span className='truncate text-[11px] font-semibold tracking-[-0.012em]'>
                          {tab.label}
                        </span>
                      </button>
                    );
                  })}
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
