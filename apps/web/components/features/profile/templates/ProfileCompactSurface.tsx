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
import { type ReactNode, useMemo } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ReleaseCountdown } from '@/components/features/release/ReleaseCountdown';
import { BASE_URL } from '@/constants/app';
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
import type { DrawerView } from '@/features/profile/ProfileUnifiedDrawer';
import type { PublicRelease } from '@/features/profile/releases/types';
import { SubscriptionConfirmedBanner } from '@/features/profile/SubscriptionConfirmedBanner';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
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

const heroActionCardClassName =
  'flex min-h-[74px] w-full items-center gap-3.5 rounded-[var(--profile-action-radius)] bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_91%,rgba(6,7,10,0.32))] px-3.5 py-3 text-left shadow-[0_14px_34px_rgba(0,0,0,0.22)] backdrop-blur-[18px] transition-[background-color,box-shadow] duration-150';
const heroActionPillClassName = `${profilePrimaryPillClassName} h-9 px-3.5 text-[12px] font-[620] tracking-[-0.012em] shadow-[0_8px_18px_rgba(0,0,0,0.14)]`;
const heroKickerClassName =
  'truncate text-[9px] font-[650] uppercase tracking-[0.12em] text-white/50';

interface HeroActionCardProps {
  readonly kicker?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly artworkUrl?: string | null;
  readonly artworkAlt: string;
  readonly trailingContent?: ReactNode;
  readonly leadingContent?: ReactNode;
}

function HeroActionCard({
  kicker,
  title,
  subtitle,
  artworkUrl,
  artworkAlt,
  trailingContent,
  leadingContent,
}: Readonly<HeroActionCardProps>) {
  return (
    <div className={heroActionCardClassName}>
      {artworkUrl ? (
        <div className='relative h-12 w-12 shrink-0 overflow-hidden rounded-[15px]'>
          <ImageWithFallback
            src={artworkUrl}
            alt={artworkAlt}
            fill
            sizes='48px'
            className='object-cover'
            fallbackVariant='release'
          />
        </div>
      ) : leadingContent ? (
        <div className='shrink-0'>{leadingContent}</div>
      ) : null}
      <div className='min-w-0 flex-1'>
        {kicker ? <p className={heroKickerClassName}>{kicker}</p> : null}
        <p className='truncate text-[14px] font-[620] leading-[1.12] text-white/94'>
          {title}
        </p>
        {subtitle ? (
          <p className='mt-0.5 truncate text-[11px] font-[510] text-white/50'>
            {subtitle}
          </p>
        ) : null}
      </div>
      {trailingContent ? (
        <div className='shrink-0'>{trailingContent}</div>
      ) : null}
    </div>
  );
}

interface HeroActionButtonProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly external?: boolean;
}

function HeroActionButton({
  label,
  ariaLabel,
  href,
  onClick,
  external = false,
}: Readonly<HeroActionButtonProps>) {
  if (href) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        aria-label={ariaLabel}
        className={heroActionPillClassName}
        onClick={external ? undefined : onClick}
      >
        {label}
      </a>
    );
  }

  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={ariaLabel}
      className={heroActionPillClassName}
    >
      {label}
    </button>
  );
}

interface ProfileCompactRelease {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly revealDate?: Date | string | null;
  readonly releaseType: string;
  readonly metadata?: Record<string, unknown> | null;
}

interface ProfileCompactSurfaceProps {
  readonly renderMode?: ProfileRenderMode;
  readonly presentation?: ProfileSurfacePresentation;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly showPayButton?: boolean;
  readonly latestRelease?: ProfileCompactRelease | null;
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

  if (kind === 'input') {
    return (
      <div data-testid='profile-inline-notifications-preview'>
        <SubscriptionPearlComposer
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
      </div>
    );
  }

  if (kind === 'status') {
    return (
      <div data-testid='profile-inline-notifications-preview'>
        <button
          type='button'
          className={`${profilePrimaryPillClassName} h-12 w-full justify-center gap-2 px-6`}
        >
          <CheckCircle2 className='h-4 w-4 shrink-0 text-green-400' />
          {notifications.label || 'Notifications on'}
        </button>
      </div>
    );
  }

  return (
    <div data-testid='profile-inline-notifications-preview'>
      <button
        type='button'
        className={`${profilePrimaryPillClassName} h-12 w-full justify-center gap-2 px-6`}
      >
        <Bell className='h-4 w-4' />
        Turn on notifications
      </button>
    </div>
  );
}

function getReleaseArtistNames(
  release: ProfileCompactRelease | null | undefined
) {
  const metadata = release?.metadata;
  const artistNames = metadata?.artistNames;

  if (!Array.isArray(artistNames)) {
    return [];
  }

  return artistNames.filter(
    name => typeof name === 'string' && name.length > 0
  );
}

function getReleaseSupportingLine(
  release: ProfileCompactRelease,
  artistName: string
) {
  const artistNames = getReleaseArtistNames(release);
  if (artistNames.length === 0) {
    return artistName;
  }

  const [primaryArtist, ...featuredArtists] = artistNames;
  if (
    primaryArtist?.toLowerCase() === artistName.toLowerCase() &&
    featuredArtists.length > 0
  ) {
    return `w/ ${featuredArtists.join(', ')}`;
  }

  return artistNames.join(', ');
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
  const latestReleaseArtworkUrl = useMemo(() => {
    return unwrapNextImageUrl(latestRelease?.artworkUrl) ?? heroImageUrl;
  }, [heroImageUrl, latestRelease?.artworkUrl]);
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
  const releaseSupportingLine = useMemo(() => {
    if (!latestRelease) {
      return artist.name;
    }

    return getReleaseSupportingLine(latestRelease, artist.name);
  }, [artist.name, latestRelease]);
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
            className='relative z-10 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)]'
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

          <div className='absolute inset-x-0 bottom-5 z-10 flex items-end justify-between gap-4 px-5'>
            <IdentityHeading className='min-w-0'>
              <Link
                data-testid='profile-identity-link'
                href={profileHref}
                aria-label={`Go to ${artist.name}'s profile`}
                className='inline-flex min-w-0 -translate-y-px items-center gap-1.5 rounded-md text-[34px] font-[590] leading-[1.04] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
              >
                <span className='truncate'>{artist.name}</span>
                {artist.is_verified ? (
                  <BadgeCheck
                    className='h-5 w-5 shrink-0 -translate-y-[2px] drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)]'
                    fill='white'
                    stroke='rgba(7,8,10,0.68)'
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
                className='mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition-[opacity,box-shadow] duration-150 hover:opacity-[0.96]'
                aria-label={`Play ${artist.name}`}
              >
                <Play className='ml-0.5 h-4 w-4 fill-current text-black/85' />
              </button>
            ) : null}
          </div>
        </header>

        <div className='relative z-10 flex shrink-0 flex-col gap-2.5 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-2.5'>
          {showSubscriptionConfirmedBanner ? (
            <SubscriptionConfirmedBanner />
          ) : null}

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

          <div className='min-h-[52px]'>
            {releaseVisibility?.show &&
            releaseVisibility.isCountdown &&
            latestRelease ? (
              <HeroActionCard
                kicker='Latest Release'
                title={latestRelease.title}
                subtitle={releaseSupportingLine}
                artworkUrl={latestReleaseArtworkUrl}
                artworkAlt={latestRelease.title}
                trailingContent={
                  <ReleaseCountdown
                    releaseDate={new Date(latestRelease.releaseDate!)}
                    compact
                  />
                }
              />
            ) : releaseVisibility?.show &&
              !releaseVisibility.isCountdown &&
              latestRelease &&
              mergedDSPs.length > 0 ? (
              <HeroActionCard
                kicker='Latest Release'
                title={latestRelease.title}
                subtitle={releaseSupportingLine}
                artworkUrl={latestReleaseArtworkUrl}
                artworkAlt={latestRelease.title}
                trailingContent={
                  <HeroActionButton
                    label={
                      renderMode === 'preview'
                        ? previewReleaseActionLabel
                        : 'Listen'
                    }
                    ariaLabel={`Listen to ${latestRelease.title}`}
                    onClick={onPlayClick}
                  />
                }
              />
            ) : nextTourDate ? (
              <HeroActionCard
                kicker='Next Show'
                title={nextTourDate.venueName ?? nextTourDate.city ?? 'Live'}
                subtitle={
                  [nextTourDate.city, nextTourDate.region]
                    .filter(Boolean)
                    .join(', ') || 'Upcoming show'
                }
                artworkAlt='Next tour date'
                leadingContent={
                  <div className='flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[14px] bg-white/[0.04] leading-none'>
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
                }
                trailingContent={
                  <HeroActionButton
                    label={nextTourDate.ticketUrl ? 'Tickets' : 'Details'}
                    ariaLabel={
                      nextTourDate.ticketUrl
                        ? 'Open ticket link'
                        : 'Open show details'
                    }
                    href={nextTourDate.ticketUrl ?? undefined}
                    onClick={
                      nextTourDate.ticketUrl
                        ? undefined
                        : () => onDrawerViewChange('tour')
                    }
                    external={Boolean(nextTourDate.ticketUrl)}
                  />
                }
              />
            ) : featuredPlaylistFallback ? (
              <HeroActionCard
                kicker='Featured Playlist'
                title={featuredPlaylistFallback.title}
                artworkUrl={featuredPlaylistFallback.imageUrl}
                artworkAlt={featuredPlaylistFallback.title}
                trailingContent={
                  <HeroActionButton
                    label='Open Playlist'
                    ariaLabel={`Open This Is playlist for ${artist.name}`}
                    href={featuredPlaylistFallback.url}
                    external
                  />
                }
              />
            ) : mergedDSPs.length > 0 ? (
              <HeroActionCard
                kicker='Latest Release'
                title={`Listen to ${artist.name}`}
                artworkAlt={artist.name}
                trailingContent={
                  <HeroActionButton
                    label={
                      renderMode === 'preview'
                        ? previewReleaseActionLabel
                        : 'Listen'
                    }
                    ariaLabel={`Listen to ${artist.name}`}
                    onClick={onPlayClick}
                  />
                }
              />
            ) : null}
          </div>

          {visibleSocialLinks.length > 0 ? (
            <nav
              className='flex items-center justify-center gap-4 pt-0.5'
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
