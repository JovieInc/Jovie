'use client';

import {
  BadgeCheck,
  Bell,
  CalendarDays,
  House,
  type LucideIcon,
  MoreHorizontal,
  Music2,
  UserRound,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { BASE_URL } from '@/constants/app';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import { profilePrimaryPillClassName } from '@/features/profile/artist-notifications-cta/shared';
import type {
  ProfileMode,
  ProfilePreviewNotificationsState,
  ProfilePrimaryTab,
  ProfileRenderMode,
  ProfileSurfacePresentation,
} from '@/features/profile/contracts';
import {
  formatProfileDateLabel,
  getUpcomingProfileTourDates,
  ProfileHomeRail,
} from '@/features/profile/ProfileHomeRail';
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

function resolveActivePrimaryTab(mode: ProfileMode): ProfilePrimaryTab {
  switch (mode) {
    case 'listen':
    case 'tour':
    case 'subscribe':
    case 'about':
      return mode;
    case 'profile':
    case 'pay':
    case 'contact':
    case 'releases':
    default:
      return 'profile';
  }
}

function resolveModeSummary(params: {
  mode: ProfileMode;
  artistName: string;
  dspCount: number;
  upcomingTourDate: TourDateViewModel | null;
  isSubscribed: boolean;
  pressPhotoCount: number;
  hasReleases: boolean;
}) {
  switch (params.mode) {
    case 'listen': {
      const destinationSuffix = params.dspCount === 1 ? '' : 's';
      return {
        title: 'Streaming Destinations',
        body:
          params.dspCount > 0
            ? `${params.artistName} is linked on ${params.dspCount} listening destination${destinationSuffix}.`
            : `Open alerts for ${params.artistName} until listening destinations are live.`,
      };
    }
    case 'tour':
      return {
        title: 'Live Dates',
        body: params.upcomingTourDate
          ? `Next date: ${formatProfileDateLabel(params.upcomingTourDate.startDate)} at ${params.upcomingTourDate.venueName}.`
          : `No tour dates are live yet. Alerts stay ready for the next announcement.`,
      };
    case 'subscribe':
      return {
        title: params.isSubscribed ? 'Manage Alerts' : 'Turn On Alerts',
        body: params.isSubscribed
          ? 'Music, shows, merch, and general updates are managed in one place.'
          : 'Get notified about new releases, show announcements, and merch drops.',
      };
    case 'about':
      return {
        title: 'Artist Profile',
        body:
          params.pressPhotoCount > 0
            ? `Bio, press photos, and key details stay collected in one place.`
            : `Bio, highlights, and links stay cleanly organized here.`,
      };
    case 'pay':
      return {
        title: 'Support This Artist',
        body: `Fans can support ${params.artistName} directly without leaving the profile shell.`,
      };
    case 'contact':
      return {
        title: 'Contact Links',
        body: `Booking, management, and press details stay easy to reach.`,
      };
    case 'releases':
      return {
        title: 'Release Archive',
        body: params.hasReleases
          ? `Catalog and recent drops stay available from the overflow menu.`
          : `The release archive will appear here as catalog builds out.`,
      };
    case 'profile':
    default:
      return {
        title: 'Featured Moments',
        body: `Swipe through releases, shows, alerts, and listening destinations.`,
      };
  }
}

function resolveStatusPill(params: {
  latestRelease?: ProfileCompactSurfaceProps['latestRelease'];
  profileSettings?: ProfileCompactSurfaceProps['profileSettings'];
  upcomingTourDate: TourDateViewModel | null;
}) {
  if (params.upcomingTourDate) {
    const city =
      params.upcomingTourDate.city || params.upcomingTourDate.venueName;
    return {
      icon: CalendarDays,
      label: `Next show ${formatProfileDateLabel(params.upcomingTourDate.startDate)} in ${city}`,
    };
  }

  const releaseVisibility = getProfileReleaseVisibility(
    params.latestRelease,
    params.profileSettings
  );
  if (releaseVisibility?.show && params.latestRelease) {
    return releaseVisibility.isCountdown
      ? {
          icon: Bell,
          label: `Release drops ${formatProfileDateLabel(params.latestRelease.releaseDate)}`,
        }
      : {
          icon: Bell,
          label: 'New release out now',
        };
  }

  return {
    icon: Bell,
    label: 'Alerts ready for the next drop',
  };
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
  onOpenMenu,
  onPlayClick,
  onShare,
  profileHref,
  artistProfilesHref,
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
  previewReleaseActionLabel = 'Listen',
  dataTestId,
  hideJovieBranding = false,
  hideMoreMenu = false,
}: Readonly<ProfileCompactSurfaceProps>) {
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
    () => getHeaderSocialLinks(socialLinks, viewerCountryCode, 2),
    [socialLinks, viewerCountryCode]
  );
  const hasTip = useMemo(
    () => showPayButton && socialLinks.some(link => link.platform === 'venmo'),
    [showPayButton, socialLinks]
  );
  const hasReleases = releases.length >= 2;
  const hasAbout = Boolean(
    artist.tagline ||
      artist.location ||
      artist.hometown ||
      artist.active_since_year ||
      (genres && genres.length > 0) ||
      (allowPhotoDownloads && pressPhotos.length > 0)
  );
  const activePrimaryTab = resolveActivePrimaryTab(activeMode);
  const isHomeMode = activeMode === 'profile';
  const upcomingTourDate = useMemo(
    () => getUpcomingProfileTourDates(tourDates)[0] ?? null,
    [tourDates]
  );
  const statusPill = useMemo(
    () =>
      resolveStatusPill({
        latestRelease,
        profileSettings,
        upcomingTourDate,
      }),
    [latestRelease, profileSettings, upcomingTourDate]
  );
  const modeSummary = useMemo(
    () =>
      resolveModeSummary({
        mode: activeMode,
        artistName: artist.name,
        dspCount: mergedDSPs.length,
        upcomingTourDate,
        isSubscribed,
        pressPhotoCount: pressPhotos.length,
        hasReleases,
      }),
    [
      activeMode,
      artist.name,
      hasReleases,
      isSubscribed,
      mergedDSPs.length,
      pressPhotos.length,
      upcomingTourDate,
    ]
  );
  const heroSubtitle = useMemo(() => {
    const tagline =
      typeof artist.tagline === 'string' ? artist.tagline.trim() : '';
    if (tagline.length > 0) {
      return tagline;
    }

    return getProfileModeDefinition(activeMode).subtitle;
  }, [activeMode, artist.tagline]);
  const IdentityHeading = renderMode === 'preview' ? 'p' : 'h1';
  const StatusIcon = statusPill.icon;

  return (
    <div
      className='relative h-full w-full'
      data-testid={dataTestId}
      data-render-mode={renderMode}
      data-profile-mode={activeMode}
    >
      <div
        className='relative flex h-full w-full flex-col overflow-hidden bg-[color:var(--profile-content-bg)]'
        data-testid='profile-compact-surface'
        data-presentation={presentation}
      >
        <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />

        <header
          className={cn(
            'relative shrink-0 overflow-hidden',
            isHomeMode ? 'min-h-[430px]' : 'min-h-[320px]'
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

          <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.14)_26%,rgba(0,0,0,0.38)_54%,rgba(5,6,8,0.88)_100%)]' />
          <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,var(--profile-stage-glow-a),transparent_30%),linear-gradient(180deg,transparent_0%,rgba(5,6,8,0.22)_58%,var(--profile-stage-bg)_100%)]' />

          <div className='relative z-10 flex h-full flex-col justify-between px-5 pb-5 pt-[max(env(safe-area-inset-top),20px)]'>
            <div className='flex items-center justify-between'>
              {hideJovieBranding ? (
                <span />
              ) : (
                <Link
                  href={artistProfilesHref ?? BASE_URL}
                  aria-label='Create your artist profile on Jovie'
                  className='rounded-full opacity-55 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
                >
                  <BrandLogo
                    size={22}
                    tone='white'
                    rounded={false}
                    className='block'
                    aria-hidden={true}
                  />
                </Link>
              )}

              {hideMoreMenu ? null : (
                <CircleIconButton
                  onClick={onOpenMenu}
                  size='xs'
                  variant='pearlQuiet'
                  className={drawerOpen ? 'bg-white/12 text-white' : undefined}
                  ariaLabel='More options'
                  aria-haspopup='dialog'
                >
                  <MoreHorizontal className='h-[15px] w-[15px]' />
                </CircleIconButton>
              )}
            </div>

            <div className='space-y-4'>
              <span className='inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--profile-status-pill-border)] bg-[color:var(--profile-status-pill-bg)] px-3.5 py-1.5 text-xs font-semibold text-[color:var(--profile-status-pill-fg)] shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl'>
                <StatusIcon className='h-3.5 w-3.5' />
                <span>{statusPill.label}</span>
              </span>

              <div className='space-y-2'>
                <IdentityHeading className='min-w-0'>
                  <Link
                    data-testid='profile-identity-link'
                    href={profileHref}
                    aria-label={`Go to ${artist.name}'s profile`}
                    className='inline-flex min-w-0 items-center gap-1.5 rounded-md text-[34px] font-semibold leading-[1.02] tracking-[-0.035em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
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

                <p className='max-w-[28ch] text-sm font-medium leading-6 tracking-[-0.012em] text-white/74'>
                  {heroSubtitle}
                </p>
              </div>

              <div className='flex items-start gap-3'>
                <div className='min-w-0 flex-1'>
                  {renderMode === 'interactive' ? (
                    <ProfileInlineNotificationsCTA
                      artist={artist}
                      onManageNotifications={onManageNotifications}
                      onRegisterReveal={onRegisterReveal}
                      variant='hero'
                    />
                  ) : (
                    <button
                      type='button'
                      className={cn(
                        profilePrimaryPillClassName,
                        'w-full justify-center gap-2'
                      )}
                      tabIndex={-1}
                    >
                      <Bell className='h-4 w-4' />
                      {previewNotificationsState.label}
                    </button>
                  )}
                </div>

                {visibleSocialLinks.length > 0 ? (
                  <div className='flex items-center gap-2'>
                    {visibleSocialLinks.map(link =>
                      link.platform && link.url ? (
                        <a
                          key={link.id}
                          href={link.url}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] text-white shadow-[var(--profile-pearl-shadow)] backdrop-blur-2xl transition-[background-color,border-color,transform] duration-200 hover:bg-[var(--profile-pearl-bg-hover)] active:scale-[0.98]'
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
        </header>

        <div className='relative z-10 flex flex-1 flex-col px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-4'>
          {showSubscriptionConfirmedBanner ? (
            <div className='pb-3'>
              <SubscriptionConfirmedBanner />
            </div>
          ) : null}

          {isHomeMode ? (
            <ProfileHomeRail
              artist={artist}
              latestRelease={latestRelease}
              profileSettings={profileSettings}
              featuredPlaylistFallback={featuredPlaylistFallback}
              tourDates={tourDates}
              hasPlayableDestinations={mergedDSPs.length > 0}
              renderMode={renderMode}
              previewActionLabel={previewReleaseActionLabel}
              onPlayClick={onPlayClick}
              onOpenAlerts={() => onModeSelect('subscribe')}
              viewerLocation={viewerLocation}
              resolveNearbyTour={resolveNearbyTour}
              isSubscribed={isSubscribed}
              previewNotificationsState={previewNotificationsState}
            />
          ) : (
            <div className='rounded-[var(--profile-card-radius)] border border-[color:var(--profile-panel-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[var(--profile-panel-shadow)] backdrop-blur-2xl'>
              <p className='text-xs font-semibold tracking-[-0.01em] text-primary-token/56'>
                {modeSummary.title}
              </p>
              <p className='mt-2 max-w-[30ch] text-base font-semibold leading-6 tracking-[-0.025em] text-primary-token'>
                {modeSummary.body}
              </p>
            </div>
          )}

          <div className='mt-auto space-y-3 pt-5'>
            {hideJovieBranding ? null : (
              <a
                href={BASE_URL}
                className='block text-center text-[11px] font-semibold tracking-[-0.01em] text-primary-token/42 transition-colors duration-150 hover:text-primary-token/64'
              >
                Powered by Jovie
              </a>
            )}

            <nav
              className='rounded-[30px] border border-[color:var(--profile-dock-border)] bg-[color:var(--profile-dock-bg)] p-1.5 shadow-[var(--profile-dock-shadow)] backdrop-blur-2xl'
              aria-label='Profile navigation'
            >
              <div className='flex items-stretch gap-1'>
                {PRIMARY_TABS.map(tab => {
                  const Icon = tab.icon;
                  const isActive = tab.mode === activePrimaryTab;
                  return (
                    <button
                      key={tab.mode}
                      type='button'
                      onClick={() => onModeSelect(tab.mode)}
                      className={cn(
                        'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[22px] px-2 py-2.5 text-center transition-[background-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                        isActive
                          ? 'bg-[color:var(--profile-tab-active-bg)] text-[color:var(--profile-tab-active-fg)] shadow-[0_16px_34px_rgba(0,0,0,0.22)]'
                          : 'text-primary-token/56 hover:bg-[var(--profile-pearl-bg)] hover:text-primary-token'
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon className='h-4 w-4 shrink-0' />
                      <span className='truncate text-[11px] font-semibold tracking-[-0.012em]'>
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      </div>

      {renderMode === 'preview' ? null : (
        <ProfileUnifiedDrawer
          open={drawerOpen}
          onOpenChange={onDrawerOpenChange}
          view={drawerView}
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
          hasAbout={hasAbout}
          hasTourDates={tourDates.length > 0}
          hasTip={hasTip}
          hasContacts={hasContacts}
          hasReleases={hasReleases}
          genres={genres}
          pressPhotos={pressPhotos}
          allowPhotoDownloads={allowPhotoDownloads}
          tourDates={tourDates}
          releases={releases}
          onRevealNotifications={onRevealNotifications}
        />
      )}
    </div>
  );
}
