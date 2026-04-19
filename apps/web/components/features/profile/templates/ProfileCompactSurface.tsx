'use client';

import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CheckCircle2,
  MoreHorizontal,
  Play,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { BASE_URL } from '@/constants/app';
import { OtpInput } from '@/features/auth/atoms/otp-input';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import {
  profilePrimaryPillClassName,
  SubscriptionPearlComposer,
} from '@/features/profile/artist-notifications-cta/shared';
import type {
  ProfilePreviewNotificationsState,
  ProfileRenderMode,
  ProfileSurfacePresentation,
} from '@/features/profile/contracts';
import {
  ProfilePrimaryActionCard,
  type ProfilePrimaryActionCardRelease,
} from '@/features/profile/ProfilePrimaryActionCard';
import type { DrawerView } from '@/features/profile/ProfileUnifiedDrawer';
import type { PublicRelease } from '@/features/profile/releases/types';
import { SubscriptionConfirmedBanner } from '@/features/profile/SubscriptionConfirmedBanner';
import type { UserLocation } from '@/hooks/useUserLocation';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import { buildProfileShareContext } from '@/lib/share/context';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
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
  { ssr: false }
);

const DEFAULT_CONTENT_PREFS: Record<NotificationContentType, boolean> = {
  newMusic: true,
  tourDates: true,
  merch: true,
  general: true,
};

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

function PreviewInlineNotifications({
  notifications,
}: Readonly<{
  notifications: ProfilePreviewNotificationsState;
}>) {
  const kind = notifications.kind ?? 'button';
  const helper = notifications.helper ?? '\u00A0';
  const composerClassName =
    notifications.tone === 'error'
      ? 'border-[#ff7a7a]/32 bg-[rgba(255,94,94,0.08)]'
      : '';

  if (kind === 'otp') {
    return (
      <div
        data-testid='profile-inline-notifications-preview'
        className='flex h-[72px] flex-col justify-between'
      >
        <SubscriptionPearlComposer
          className={composerClassName}
          action={
            <span
              className={`${profilePrimaryPillClassName} !h-10 !w-10 !px-0`}
            >
              <ArrowRight className='h-4 w-4' />
            </span>
          }
        >
          <div className='min-w-0 px-1 py-1'>
            <div className='pointer-events-none'>
              <OtpInput
                value={notifications.value ?? '123456'}
                onChange={() => {}}
                autoFocus={false}
                aria-label={notifications.label}
                error={notifications.tone === 'error'}
                size='compact'
                showProgressDots={false}
              />
            </div>
          </div>
        </SubscriptionPearlComposer>
        <p className='px-1 text-[10px] font-[560] text-white/46'>{helper}</p>
      </div>
    );
  }

  if (kind === 'input') {
    return (
      <div
        data-testid='profile-inline-notifications-preview'
        className='flex h-[72px] flex-col justify-between'
      >
        <SubscriptionPearlComposer
          className={composerClassName}
          action={
            <span
              className={`${profilePrimaryPillClassName} !h-10 !w-10 !px-0`}
            >
              <ArrowRight className='h-4 w-4' />
            </span>
          }
        >
          <div className='min-w-0 px-2 py-1.5'>
            <p className='truncate text-[15px] font-[560] tracking-[-0.02em] text-white/86'>
              {notifications.value ?? 'fan@example.com'}
            </p>
          </div>
        </SubscriptionPearlComposer>
        <p className='px-1 text-[10px] font-[560] text-white/46'>{helper}</p>
      </div>
    );
  }

  if (kind === 'name' || kind === 'birthday') {
    return (
      <div
        data-testid='profile-inline-notifications-preview'
        className='flex h-[72px] flex-col justify-between'
      >
        <SubscriptionPearlComposer
          className={composerClassName}
          action={
            <span
              className={`${profilePrimaryPillClassName} !h-10 !w-10 !px-0`}
            >
              <ArrowRight className='h-4 w-4' />
            </span>
          }
        >
          <div className='min-w-0 px-3 py-1.5'>
            <p className='truncate text-[15px] font-[560] tracking-[-0.02em] text-white/86'>
              {notifications.value ??
                (kind === 'name' ? 'Your name' : 'MM/DD/YYYY')}
            </p>
          </div>
        </SubscriptionPearlComposer>
        <p className='px-1 text-[10px] font-[560] text-white/46'>{helper}</p>
      </div>
    );
  }

  if (kind === 'status') {
    return (
      <div
        data-testid='profile-inline-notifications-preview'
        className='flex h-[72px] flex-col justify-between'
      >
        <button
          type='button'
          className={`${profilePrimaryPillClassName} h-12 w-full justify-center gap-2 px-6`}
          tabIndex={-1}
        >
          <CheckCircle2 className='h-4 w-4 shrink-0 text-green-400' />
          {notifications.label || 'Notifications on'}
        </button>
        <p className='px-1 text-[10px] font-[560] text-white/46'>{helper}</p>
      </div>
    );
  }

  return (
    <div
      data-testid='profile-inline-notifications-preview'
      className='flex h-[72px] flex-col justify-between'
    >
      <button
        type='button'
        className={`${profilePrimaryPillClassName} h-12 w-full justify-center gap-2 px-6`}
        tabIndex={-1}
      >
        <Bell className='h-4 w-4' />
        {notifications.label || 'Turn on notifications'}
      </button>
      <p className='px-1 text-[10px] font-[560] text-white/46'>{helper}</p>
    </div>
  );
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
    label: 'Turn on notifications',
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
  const visibleSocialLinks = useMemo(() => {
    return getHeaderSocialLinks(socialLinks, viewerCountryCode, 2);
  }, [socialLinks, viewerCountryCode]);
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
  const IdentityHeading = renderMode === 'preview' ? 'p' : 'h1';

  return (
    <div
      className='relative h-full w-full'
      data-testid={dataTestId}
      data-render-mode={renderMode}
    >
      {/* interactive => live route controller owns side effects; preview => homepage drives pure state */}
      <div
        className='relative flex h-full w-full flex-col overflow-hidden bg-[color:var(--profile-content-bg)]'
        data-testid='profile-compact-shell'
      >
        <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />

        <header className='relative min-h-0 flex-1'>
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

          <div className='pointer-events-none absolute inset-x-0 top-0 h-[36%] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0.15)_55%,transparent_100%)]' />
          <div className='pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(to_top,var(--profile-stage-bg)_0%,rgba(5,6,8,0.75)_45%,transparent_100%)]' />

          <div
            className='relative z-10 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),20px)]'
            data-testid='profile-header'
          >
            {!hideJovieBranding && (
              <Link
                href={artistProfilesHref ?? BASE_URL}
                aria-label='Create your artist profile on Jovie'
                className='rounded-full opacity-45 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-opacity duration-150 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
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

            {!hideMoreMenu && (
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

          <div className='absolute inset-x-0 bottom-5 z-10 flex items-end justify-between px-5'>
            <IdentityHeading className='min-w-0'>
              <Link
                data-testid='profile-identity-link'
                href={profileHref}
                aria-label={`Go to ${artist.name}'s profile`}
                className='inline-flex min-w-0 items-center gap-1.5 rounded-md text-[34px] font-[590] leading-[1.06] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
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
            {mergedDSPs.length > 0 ? (
              <button
                type='button'
                onClick={onPlayClick}
                className='mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-transform duration-150 hover:scale-[1.06] active:scale-95'
                aria-label={`Play ${artist.name}`}
              >
                <Play className='ml-0.5 h-3.5 w-3.5 fill-current text-black/85' />
              </button>
            ) : null}
          </div>
        </header>

        <div className='relative z-10 flex shrink-0 flex-col gap-3 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3'>
          {showSubscriptionConfirmedBanner ? (
            <SubscriptionConfirmedBanner />
          ) : null}

          <div className='min-h-[52px]'>
            <ProfilePrimaryActionCard
              artist={artist}
              latestRelease={latestRelease}
              profileSettings={profileSettings}
              featuredPlaylistFallback={featuredPlaylistFallback}
              tourDates={tourDates}
              hasPlayableDestinations={mergedDSPs.length > 0}
              renderMode={renderMode}
              previewActionLabel={previewReleaseActionLabel}
              onPlayClick={onPlayClick}
              viewerLocation={viewerLocation}
              resolveNearbyTour={resolveNearbyTour}
            />
          </div>

          {renderMode === 'interactive' ? (
            <ProfileInlineNotificationsCTA
              artist={artist}
              onManageNotifications={onManageNotifications}
              onRegisterReveal={onRegisterReveal}
            />
          ) : (
            <PreviewInlineNotifications
              notifications={previewNotificationsState}
            />
          )}

          {visibleSocialLinks.length > 0 ? (
            <nav
              className='flex items-center justify-center gap-4'
              aria-label='Social links'
            >
              {visibleSocialLinks.map(link =>
                link.platform && link.url ? (
                  <a
                    key={link.id}
                    href={link.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-white/35 transition-colors duration-150 hover:text-white/70'
                    aria-label={`${link.platform}`}
                  >
                    <SocialIcon
                      platform={link.platform}
                      className='h-[18px] w-[18px]'
                    />
                  </a>
                ) : null
              )}
            </nav>
          ) : null}

          <a
            href={BASE_URL}
            className='flex flex-col items-center gap-0.5 pt-1 text-white/20 transition-colors duration-150 hover:text-white/40'
          >
            <span className='text-[8px] font-[510] uppercase tracking-[0.14em]'>
              Powered by
            </span>
            <span className='text-[13px] font-[590] tracking-[-0.01em]'>
              Jovie
            </span>
          </a>
        </div>
      </div>

      {renderMode !== 'preview' && (
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
