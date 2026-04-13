'use client';

import {
  BadgeCheck,
  Bell,
  CheckCircle2,
  MoreHorizontal,
  Play,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ReleaseCountdown } from '@/components/features/release/ReleaseCountdown';
import { BASE_URL } from '@/constants/app';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import {
  SubscriptionPearlComposer,
  subscriptionPrimaryActionClassName,
} from '@/features/profile/artist-notifications-cta/shared';
import type {
  ProfilePreviewNotificationsState,
  ProfileRenderMode,
  ProfileSurfacePresentation,
} from '@/features/profile/contracts';
import type { DrawerView } from '@/features/profile/ProfileUnifiedDrawer';
import { SubscriptionConfirmedBanner } from '@/features/profile/SubscriptionConfirmedBanner';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
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

const glass = {
  bg: 'bg-white/[0.05]',
  bgHover: 'hover:bg-white/[0.08]',
  border: 'border-white/[0.08]',
  blur: 'backdrop-blur-2xl',
} as const;

const DEFAULT_CONTENT_PREFS: Record<NotificationContentType, boolean> = {
  newMusic: true,
  tourDates: true,
  merch: true,
  general: true,
};

interface ProfileCompactRelease {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly revealDate?: Date | string | null;
  readonly releaseType: string;
}

interface ProfileCompactSurfaceProps {
  readonly renderMode?: ProfileRenderMode;
  readonly presentation?: ProfileSurfacePresentation;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly latestRelease?: ProfileCompactRelease | null;
  readonly profileSettings?: {
    readonly showOldReleases?: boolean;
  } | null;
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly tourDates?: TourDateViewModel[];
  readonly showSubscriptionConfirmedBanner?: boolean;
  readonly viewerCountryCode?: string | null;
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
  readonly dataTestId?: string;
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
  return (
    <div data-testid='profile-inline-notifications-preview'>
      <SubscriptionPearlComposer
        action={
          <span
            className={`${subscriptionPrimaryActionClassName} min-w-[9rem]`}
          >
            {notifications.actionLabel ?? 'Join fans'}
          </span>
        }
      >
        <div className='flex min-w-0 items-center gap-3 px-2 py-1'>
          <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/72'>
            {notifications.tone === 'success' ? (
              <CheckCircle2 className='h-4 w-4 text-green-400' />
            ) : (
              <Bell className='h-4 w-4' />
            )}
          </span>
          <div className='min-w-0'>
            <p className='truncate text-[13px] font-[560] tracking-[-0.015em] text-white/86'>
              {notifications.label}
            </p>
            <p className='truncate text-[12px] leading-[1.5] text-white/48'>
              {notifications.value ??
                notifications.helper ??
                'Get notified about new music and shows.'}
            </p>
          </div>
        </div>
      </SubscriptionPearlComposer>
    </div>
  );
}

export function ProfileCompactSurface({
  renderMode = 'interactive',
  presentation = 'standalone',
  artist,
  socialLinks,
  contacts,
  latestRelease,
  profileSettings,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  photoDownloadSizes = [],
  tourDates = [],
  showSubscriptionConfirmedBanner = false,
  viewerCountryCode,
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
    tone: 'quiet',
    label: 'Join 1.2K subscribers',
    helper: 'Get notified about new music and shows.',
    actionLabel: 'Join fans',
  },
  dataTestId,
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
    () => socialLinks.some(link => link.platform === 'venmo'),
    [socialLinks]
  );
  const hasAbout = Boolean(
    artist.tagline ||
      artist.location ||
      artist.hometown ||
      artist.active_since_year ||
      (genres && genres.length > 0) ||
      (allowPhotoDownloads && pressPhotos.length > 0)
  );
  const releaseVisibility = useMemo(
    () => getProfileReleaseVisibility(latestRelease, profileSettings),
    [latestRelease, profileSettings]
  );
  const nextTourDate = useMemo(() => {
    const now = Date.now();
    return (
      tourDates.find(td => new Date(td.startDate).getTime() >= now) ?? null
    );
  }, [tourDates]);
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

            <button
              type='button'
              onClick={onOpenMenu}
              className={`flex h-8 w-8 items-center justify-center rounded-full ${glass.border} bg-black/25 text-white/70 ${glass.blur} transition-colors duration-150 hover:bg-black/40`}
              aria-label='More options'
              aria-haspopup='dialog'
            >
              <MoreHorizontal className='h-[15px] w-[15px]' />
            </button>
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
            {releaseVisibility?.show &&
            releaseVisibility.isCountdown &&
            latestRelease ? (
              <Link
                href={`/${artist.handle}/${latestRelease.slug}`}
                prefetch={false}
                className={`group flex w-full items-center gap-2.5 rounded-[var(--profile-action-radius)] border ${glass.border} ${glass.bg} px-2.5 py-2 text-left ${glass.blur} transition-colors duration-150 ${glass.bgHover} active:scale-[0.985]`}
                aria-label={`${latestRelease.title} — drops soon`}
              >
                {latestRelease.artworkUrl ? (
                  <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md'>
                    <ImageWithFallback
                      src={latestRelease.artworkUrl}
                      alt={latestRelease.title}
                      fill
                      sizes='40px'
                      className='object-cover'
                      fallbackVariant='release'
                    />
                  </div>
                ) : null}
                <p className='min-w-0 flex-1 truncate text-[13px] font-[510] leading-[1.15] text-white/88'>
                  {latestRelease.title}
                </p>
                <ReleaseCountdown
                  releaseDate={new Date(latestRelease.releaseDate!)}
                  compact
                />
              </Link>
            ) : releaseVisibility?.show &&
              !releaseVisibility.isCountdown &&
              latestRelease &&
              mergedDSPs.length > 0 ? (
              <button
                type='button'
                onClick={onPlayClick}
                className={`group flex w-full items-center gap-2.5 rounded-[var(--profile-action-radius)] border ${glass.border} ${glass.bg} px-2.5 py-2 text-left ${glass.blur} transition-colors duration-150 ${glass.bgHover} active:scale-[0.985]`}
                aria-label={`Listen to ${latestRelease.title}`}
              >
                {latestRelease.artworkUrl ? (
                  <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md'>
                    <ImageWithFallback
                      src={latestRelease.artworkUrl}
                      alt={latestRelease.title}
                      fill
                      sizes='40px'
                      className='object-cover'
                      fallbackVariant='release'
                    />
                  </div>
                ) : null}
                <p className='min-w-0 flex-1 truncate text-[13px] font-[510] leading-[1.15] text-white/88'>
                  {latestRelease.title}
                </p>
                <span className='shrink-0 rounded-full bg-white/[0.1] px-3 py-1 text-[11px] font-[510] text-white/80 transition-colors duration-150 group-hover:bg-white/[0.15]'>
                  Listen
                </span>
              </button>
            ) : nextTourDate ? (
              <a
                href={nextTourDate.ticketUrl ?? '#'}
                target={nextTourDate.ticketUrl ? '_blank' : undefined}
                rel={nextTourDate.ticketUrl ? 'noopener noreferrer' : undefined}
                className={`group flex w-full items-center gap-2.5 rounded-[var(--profile-action-radius)] border ${glass.border} ${glass.bg} px-3 py-2.5 text-left ${glass.blur} transition-colors duration-150 ${glass.bgHover} active:scale-[0.985]`}
              >
                <div className='flex shrink-0 flex-col items-center leading-none'>
                  <span className='text-[10px] font-[590] uppercase tracking-[0.1em] text-white/45'>
                    {new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                    }).format(new Date(nextTourDate.startDate))}
                  </span>
                  <span className='text-[18px] font-[680] tracking-[-0.04em] text-white/90'>
                    {new Intl.DateTimeFormat('en-US', {
                      day: 'numeric',
                    }).format(new Date(nextTourDate.startDate))}
                  </span>
                </div>
                <p className='min-w-0 flex-1 truncate text-[13px] font-[510] text-white/80'>
                  {nextTourDate.venueName ?? nextTourDate.city ?? 'Live'}
                </p>
                <span className='shrink-0 rounded-full bg-white/[0.1] px-3 py-1 text-[11px] font-[510] text-white/80 transition-colors duration-150 group-hover:bg-white/[0.15]'>
                  {nextTourDate.ticketUrl ? 'Tickets' : 'Details'}
                </span>
              </a>
            ) : mergedDSPs.length > 0 ? (
              <button
                type='button'
                onClick={onPlayClick}
                className={`group flex w-full items-center gap-2.5 rounded-[var(--profile-action-radius)] border ${glass.border} ${glass.bg} px-3 py-2.5 text-left ${glass.blur} transition-colors duration-150 ${glass.bgHover} active:scale-[0.985]`}
                aria-label={`Listen to ${artist.name}`}
              >
                <Play className='h-4 w-4 shrink-0 fill-current text-white/60' />
                <p className='min-w-0 flex-1 text-[13px] font-[510] text-white/80'>
                  Listen to {artist.name}
                </p>
                <span className='shrink-0 rounded-full bg-white/[0.1] px-3 py-1 text-[11px] font-[510] text-white/80 transition-colors duration-150 group-hover:bg-white/[0.15]'>
                  Listen
                </span>
              </button>
            ) : null}
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

      <ProfileUnifiedDrawer
        open={drawerOpen}
        onOpenChange={onDrawerOpenChange}
        view={drawerView}
        onViewChange={onDrawerViewChange}
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
        onShare={onShare}
        enableDynamicEngagement={enableDynamicEngagement}
        subscribeTwoStep={subscribeTwoStep}
        hasAbout={hasAbout}
        hasTourDates={tourDates.length > 0}
        hasTip={hasTip}
        hasContacts={hasContacts}
        genres={genres}
        pressPhotos={pressPhotos}
        allowPhotoDownloads={allowPhotoDownloads}
        tourDates={tourDates}
        onRevealNotifications={onRevealNotifications}
        renderMode={renderMode}
        presentation={presentation}
        previewNotificationsState={previewNotificationsState}
      />
    </div>
  );
}
