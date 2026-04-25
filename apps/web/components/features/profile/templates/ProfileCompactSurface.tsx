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
import { useMemo, useState } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import { profileHeroMorphPillClassName } from '@/features/profile/artist-notifications-cta/shared';
import type {
  ProfileMode,
  ProfilePreviewNotificationsState,
  ProfilePrimaryTab,
  ProfileRenderMode,
  ProfileSurfacePresentation,
} from '@/features/profile/contracts';
import { ProfileHomeRail } from '@/features/profile/ProfileHomeRail';
import { ProfilePrimaryTabPanel } from '@/features/profile/ProfilePrimaryTabPanel';
import type { DrawerView } from '@/features/profile/ProfileUnifiedDrawer';
import { getProfileModeDefinition } from '@/features/profile/registry';
import type { PublicRelease } from '@/features/profile/releases/types';
import { SubscriptionConfirmedBanner } from '@/features/profile/SubscriptionConfirmedBanner';
import type { UserLocation } from '@/hooks/useUserLocation';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import { buildProfileShareContext } from '@/lib/share/context';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import { getHeaderSocialLinks } from '@/lib/utils/context-aware-links';
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
  readonly latestRelease?: {
    readonly title: string;
    readonly slug: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: Date | string | null;
    readonly revealDate?: Date | string | null;
    readonly releaseType: string;
    readonly metadata?: Record<string, unknown> | null;
  } | null;
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

function toDateValue(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3])
      )
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getUpcomingTourDate(
  tourDates: readonly TourDateViewModel[]
): TourDateViewModel | null {
  const today = startOfLocalDay(new Date());

  return (
    [...tourDates]
      .filter(tourDate => {
        const start = toDateValue(tourDate.startDate);
        return (
          start !== null && startOfLocalDay(start).getTime() >= today.getTime()
        );
      })
      .sort(
        (left, right) =>
          (toDateValue(left.startDate)?.getTime() ?? 0) -
          (toDateValue(right.startDate)?.getTime() ?? 0)
      )[0] ?? null
  );
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

function resolveStatusPill(params: {
  latestRelease?: ProfileCompactSurfaceProps['latestRelease'];
  profileSettings?: ProfileCompactSurfaceProps['profileSettings'];
  upcomingTourDate: TourDateViewModel | null;
  isSubscribed: boolean;
}) {
  if (params.upcomingTourDate) {
    return {
      icon: CalendarDays,
      label: 'On Tour',
    };
  }

  const releaseVisibility = getProfileReleaseVisibility(
    params.latestRelease,
    params.profileSettings
  );
  if (releaseVisibility?.show && params.latestRelease) {
    return {
      icon: Bell,
      label: 'New Release',
    };
  }

  return {
    icon: Bell,
    label: params.isSubscribed ? 'Alerts On' : 'Alerts Ready',
  };
}

function readHeroRoleLabel(artist: Artist) {
  const label = artist.settings?.heroRoleLabel;
  if (typeof label !== 'string') {
    return null;
  }

  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  const mergedDSPs = useMemo(
    () =>
      sortDSPsByGeoPopularity(
        getCanonicalProfileDSPs(artist, socialLinks),
        viewerCountryCode
      ),
    [artist, socialLinks, viewerCountryCode]
  );
  const heroImageUrl = useMemo(() => {
    return unwrapNextImageUrl(
      photoDownloadSizes.find(size => size.key === 'large')?.url ??
        photoDownloadSizes.find(size => size.key === 'original')?.url ??
        artist.image_url ??
        null
    );
  }, [artist.image_url, photoDownloadSizes]);
  const shareContext = useMemo(
    () =>
      buildProfileShareContext({
        username: artist.handle,
        artistName: artist.name,
        avatarUrl: heroImageUrl,
      }),
    [artist.handle, artist.name, heroImageUrl]
  );
  const {
    available: availableContacts,
    primaryChannel,
    isEnabled: hasContacts,
  } = useArtistContacts({
    contacts,
    artistHandle: artist.handle,
  });
  const visibleSocialLinks = useMemo(
    () =>
      headerSocialLinksOverride
        ? [...headerSocialLinksOverride]
        : getHeaderSocialLinks(socialLinks, viewerCountryCode, 2),
    [headerSocialLinksOverride, socialLinks, viewerCountryCode]
  );
  const hasTip = useMemo(
    () => showPayButton && socialLinks.some(link => link.platform === 'venmo'),
    [showPayButton, socialLinks]
  );
  const hasReleases = releases.length >= 2;
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
  const upcomingTourDate = useMemo(
    () => getUpcomingTourDate(tourDates),
    [tourDates]
  );
  const statusPill = useMemo(
    () =>
      resolveStatusPill({
        latestRelease,
        profileSettings,
        upcomingTourDate,
        isSubscribed,
      }),
    [isSubscribed, latestRelease, profileSettings, upcomingTourDate]
  );
  const heroSubtitle = useMemo(() => {
    const tagline =
      typeof artist.tagline === 'string' ? artist.tagline.trim() : '';
    if (tagline.length > 0) {
      return tagline;
    }

    return getProfileModeDefinition(activePrimaryTab).subtitle;
  }, [activePrimaryTab, artist.tagline]);
  const heroRoleLabel = useMemo(() => readHeroRoleLabel(artist), [artist]);
  const IdentityHeading = renderMode === 'preview' ? 'p' : 'h1';
  const topChromeButtonClassName =
    '!h-12 !w-12 border-transparent bg-black/44 text-white shadow-[0_20px_44px_rgba(0,0,0,0.34)] backdrop-blur-md hover:bg-black/56';

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
                ? 'min-h-[440px]'
                : 'min-h-[456px]'
              : isPreviewEmbedded
                ? 'min-h-[316px]'
                : 'min-h-[408px]'
          )}
        >
          <div className='absolute inset-0'>
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
                <IdentityHeading className='min-w-0'>
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
                    'max-w-[28ch] font-medium tracking-[-0.012em] text-white/74',
                    isPreviewEmbedded
                      ? 'text-[15px] leading-5'
                      : 'text-sm leading-6'
                  )}
                >
                  {heroSubtitle}
                </p>
              </div>

              <div className='space-y-3.5'>
                <div
                  className='flex min-w-0 flex-wrap items-center gap-2.5'
                  data-testid='profile-hero-status-row'
                >
                  <span
                    className='inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-[color:var(--profile-status-pill-border)] bg-[color:var(--profile-status-pill-bg)] px-4 text-[13px] font-semibold tracking-[-0.01em] text-[color:var(--profile-accent-primary)] shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl'
                    data-testid='profile-hero-status-pill'
                  >
                    <span className='h-2 w-2 rounded-full bg-[color:var(--profile-accent-primary)]' />
                    <span>{statusPill.label}</span>
                  </span>

                  {heroRoleLabel ? (
                    <span
                      className='inline-flex h-11 shrink-0 items-center rounded-full border border-white/12 bg-black/18 px-4 text-[13px] font-medium tracking-[-0.01em] text-white/64 shadow-[0_14px_28px_rgba(0,0,0,0.22)] backdrop-blur-xl'
                      data-testid='profile-hero-role-pill'
                    >
                      {heroRoleLabel}
                    </span>
                  ) : null}
                </div>

                <div
                  className={cn(
                    'flex items-end justify-between gap-3.5',
                    isPreviewEmbedded ? 'pt-1' : ''
                  )}
                >
                  <div
                    className='shrink-0'
                    data-testid='profile-hero-notifications-cta'
                  >
                    {renderMode === 'interactive' ? (
                      <ProfileInlineNotificationsCTA
                        artist={artist}
                        onManageNotifications={onManageNotifications}
                        onRegisterReveal={onRegisterReveal}
                        portalContainer={notificationsPortalContainer}
                        variant='hero'
                      />
                    ) : (
                      <button
                        type='button'
                        className={cn(
                          profileHeroMorphPillClassName,
                          'gap-2 whitespace-nowrap px-4.5'
                        )}
                        tabIndex={-1}
                      >
                        <Bell className='h-4 w-4' />
                        {isSubscribed ? 'Manage alerts' : 'Turn on alerts'}
                      </button>
                    )}
                  </div>

                  {visibleSocialLinks.length > 0 ? (
                    <div
                      className={cn(
                        'flex shrink-0 items-center',
                        isPreviewEmbedded ? 'gap-3.5' : 'gap-4'
                      )}
                      data-testid='profile-hero-social-row'
                    >
                      {visibleSocialLinks.map((link, index) =>
                        link.platform && link.url ? (
                          <div
                            key={link.id}
                            className={cn(
                              'flex items-center',
                              isPreviewEmbedded ? 'gap-3.5' : 'gap-4'
                            )}
                          >
                            <a
                              href={link.url}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/24 text-white shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition-[background-color,border-color,transform] duration-200 hover:bg-black/34 active:scale-[0.98]'
                              aria-label={link.platform}
                            >
                              <SocialIcon
                                platform={link.platform}
                                className='h-[18px] w-[18px]'
                              />
                            </a>
                            {index < visibleSocialLinks.length - 1 ? (
                              <span
                                className='h-8 w-px bg-white/18'
                                aria-hidden='true'
                              />
                            ) : null}
                          </div>
                        ) : null
                      )}
                    </div>
                  ) : null}
                </div>
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
                onOpenAlerts={() => onModeSelect('subscribe')}
                viewerLocation={viewerLocation}
                resolveNearbyTour={resolveNearbyTour}
                isSubscribed={isSubscribed}
                previewNotificationsState={previewNotificationsState}
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
                          'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5 text-center transition-[background-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
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
