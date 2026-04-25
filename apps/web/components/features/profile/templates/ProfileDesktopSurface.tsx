'use client';

import { Switch } from '@jovie/ui';
import {
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronRight,
  Disc3,
  House,
  Mail,
  MapPin,
  MoreHorizontal,
  Music2,
  Play,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { AboutSection } from '@/features/profile/AboutSection';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import { ProfileInlineNotificationsCTA } from '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA';
import type {
  ProfileMode,
  ProfilePrimaryTab,
  ProfileSurfacePresentation,
} from '@/features/profile/contracts';
import type { DrawerView } from '@/features/profile/ProfileUnifiedDrawer';
import { ProfileUnifiedDrawer } from '@/features/profile/ProfileUnifiedDrawer';
import { ReleasesView } from '@/features/profile/views/ReleasesView';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import { readArtistEmailReadyFromSettings } from '@/lib/notifications/artist-email';
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
import type { PublicRelease } from '../releases/types';

const PRIMARY_TABS: ReadonlyArray<{
  mode: ProfilePrimaryTab;
  label: string;
  icon: typeof House;
}> = [
  { mode: 'profile', label: 'Home', icon: House },
  { mode: 'listen', label: 'Music', icon: Music2 },
  { mode: 'tour', label: 'Events', icon: CalendarDays },
  { mode: 'subscribe', label: 'Alerts', icon: Bell },
  { mode: 'about', label: 'Profile', icon: UserRound },
];

interface ProfileDesktopSurfaceProps {
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
  } | null;
  readonly profileSettings?: {
    readonly showOldReleases?: boolean;
  } | null;
  readonly genres?: string[] | null;
  readonly pressPhotos?: PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly tourDates?: TourDateViewModel[];
  readonly viewerCountryCode?: string | null;
  readonly releases?: readonly PublicRelease[];
  readonly drawerOpen: boolean;
  readonly drawerView: DrawerView;
  readonly activeMode?: ProfileMode;
  readonly onModeSelect?: (mode: ProfilePrimaryTab) => void;
  readonly onAlertsModalClose?: () => void;
  readonly onDrawerOpenChange: (open: boolean) => void;
  readonly onDrawerViewChange: (view: DrawerView) => void;
  readonly onOpenMenu: () => void;
  readonly onPlayClick: () => void;
  readonly profileHref: string;
  readonly isSubscribed?: boolean;
  readonly contentPrefs?: Record<NotificationContentType, boolean>;
  readonly onTogglePref?: (key: NotificationContentType) => void;
  readonly onUnsubscribe?: () => void;
  readonly isUnsubscribing?: boolean;
}

function unwrapNextImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname !== '/_next/image') return url;
    return parsed.searchParams.get('url') ?? url;
  } catch {
    return url;
  }
}

function toDateValue(value: Date | string | null | undefined) {
  if (!value) return null;

  if (value instanceof Date) {
    const next = new Date(value);
    return Number.isNaN(next.getTime()) ? null : next;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const next = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3])
      )
    : new Date(value);

  return Number.isNaN(next.getTime()) ? null : next;
}

function startOfLocalDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getUpcomingTourDates(tourDates: readonly TourDateViewModel[]) {
  const today = startOfLocalDay(new Date());

  return [...tourDates]
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
    );
}

function formatMonth(date: string | Date | null | undefined) {
  const resolved = toDateValue(date);
  if (!resolved) return 'Soon';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
  }).format(resolved);
}

function formatDay(date: string | Date | null | undefined) {
  const resolved = toDateValue(date);
  if (!resolved) return '—';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
  }).format(resolved);
}

function formatReleaseMeta(
  releaseType: string | null | undefined,
  releaseDate: string | Date | null | undefined
) {
  const year = toDateValue(releaseDate)?.getFullYear();
  const normalizedType =
    !releaseType || releaseType.length === 0
      ? 'Release'
      : releaseType
          .replaceAll('_', ' ')
          .replace(/^./, value => value.toUpperCase());

  return [normalizedType, year].filter(Boolean).join(' • ');
}

function readHeroRoleLabel(artist: Artist) {
  const label = artist.settings?.heroRoleLabel;
  if (typeof label !== 'string') return null;
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getDesktopBaseMode(mode: ProfileMode): ProfilePrimaryTab {
  switch (mode) {
    case 'listen':
    case 'releases':
      return 'listen';
    case 'tour':
      return 'tour';
    case 'subscribe':
      return 'subscribe';
    case 'about':
      return 'about';
    default:
      return 'profile';
  }
}

function DesktopSurfaceCard({
  title,
  actionLabel,
  onAction,
  children,
  className,
}: Readonly<{
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        'rounded-[28px] border border-white/8 bg-[rgba(16,18,22,0.94)] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.28)]',
        className
      )}
    >
      <div className='mb-4 flex items-center justify-between gap-4'>
        <h2 className='text-[18px] font-semibold tracking-[-0.03em] text-white'>
          {title}
        </h2>
        {actionLabel && onAction ? (
          <button
            type='button'
            onClick={onAction}
            className='inline-flex items-center gap-1.5 text-[13px] font-medium tracking-[-0.015em] text-white/56 transition-colors duration-200 hover:text-white'
          >
            <span>{actionLabel}</span>
            <ChevronRight className='h-4 w-4' />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function ProfileDesktopSurface({
  presentation = 'modal',
  artist,
  socialLinks,
  contacts,
  showPayButton = true,
  latestRelease,
  profileSettings,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  photoDownloadSizes = [],
  tourDates = [],
  viewerCountryCode,
  releases = [],
  drawerOpen,
  drawerView,
  activeMode = 'profile',
  onModeSelect = () => {},
  onAlertsModalClose,
  onDrawerOpenChange,
  onDrawerViewChange,
  onOpenMenu,
  onPlayClick,
  profileHref,
  isSubscribed = false,
  contentPrefs = {
    newMusic: false,
    tourDates: false,
    merch: false,
    general: false,
  },
  onTogglePref = () => {},
  onUnsubscribe = () => {},
  isUnsubscribing = false,
}: ProfileDesktopSurfaceProps) {
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
  const shareContext = useMemo(
    () =>
      buildProfileShareContext({
        username: artist.handle,
        artistName: artist.name,
        avatarUrl: artist.image_url ?? null,
      }),
    [artist.handle, artist.image_url, artist.name]
  );
  const { primaryChannel, isEnabled: hasContacts } = useArtistContacts({
    contacts,
    artistHandle: artist.handle,
  });
  const heroImageUrl = useMemo(
    () =>
      unwrapNextImageUrl(
        photoDownloadSizes.find(size => size.key === 'large')?.url ??
          photoDownloadSizes.find(size => size.key === 'original')?.url ??
          artist.image_url ??
          null
      ),
    [artist.image_url, photoDownloadSizes]
  );
  const activePrimaryTab = getDesktopBaseMode(activeMode);
  const visibleReleases = useMemo(
    () => releases.filter(release => Boolean(release.slug)),
    [releases]
  );
  const latestVisibleRelease = useMemo(() => {
    const visibility = getProfileReleaseVisibility(
      latestRelease,
      profileSettings
    );
    return visibility?.show ? latestRelease : null;
  }, [latestRelease, profileSettings]);
  const upcomingTourDates = useMemo(
    () => getUpcomingTourDates(tourDates),
    [tourDates]
  );
  const nextShow = upcomingTourDates[0] ?? null;
  const heroSubtitle =
    typeof artist.tagline === 'string' && artist.tagline.trim().length > 0
      ? artist.tagline.trim()
      : (latestVisibleRelease?.title ?? 'Artist profile');
  const heroRoleLabel = readHeroRoleLabel(artist);
  const statusLabel = nextShow
    ? 'On Tour'
    : isSubscribed
      ? 'Alerts On'
      : latestVisibleRelease
        ? 'New Release'
        : 'Alerts Ready';
  const visibleSocialLinks = useMemo(
    () => getHeaderSocialLinks(socialLinks, viewerCountryCode, 2),
    [socialLinks, viewerCountryCode]
  );
  const hasTip =
    showPayButton && socialLinks.some(link => link.platform === 'venmo');
  const hasReleases = visibleReleases.length > 0;
  // The artist-email opt-in row should only appear when the artist has wired
  // up an email destination AND the visitor has actually subscribed —
  // otherwise the toggle is meaningless and confuses unsubscribed visitors.
  const artistEmailReady = readArtistEmailReadyFromSettings(artist.settings);
  const showArtistEmailRow = isSubscribed && artistEmailReady;

  const homeOverview = (
    <div className='grid min-h-0 flex-1 gap-3.5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.95fr)]'>
      <div className='grid min-h-0 gap-3.5'>
        <section className='relative min-h-[510px] overflow-hidden rounded-[32px] border border-white/8 bg-[#0a0c10]'>
          <div className='absolute inset-0'>
            <ImageWithFallback
              src={heroImageUrl}
              alt={artist.name}
              fill
              priority
              sizes='(max-width: 1536px) 60vw, 900px'
              className='object-cover object-center'
              fallbackVariant='avatar'
              fallbackClassName='bg-surface-2'
            />
          </div>
          <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,8,0.14)_0%,rgba(7,8,10,0.38)_42%,rgba(7,8,10,0.98)_100%)]' />
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,var(--profile-stage-glow-a),transparent_22%)]' />
          <div className='relative z-10 flex h-full flex-col justify-between p-6'>
            <div className='flex justify-end'>
              <button
                type='button'
                onClick={onOpenMenu}
                className='inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/34 text-white shadow-[0_20px_48px_rgba(0,0,0,0.32)] backdrop-blur-xl transition-colors duration-200 hover:bg-black/48'
                aria-label='More options'
              >
                <MoreHorizontal className='h-5 w-5' />
              </button>
            </div>

            <div className='space-y-5'>
              <div className='space-y-2.5'>
                <Link
                  href={profileHref}
                  className='inline-flex items-center gap-2 rounded-md text-[58px] font-semibold leading-[0.96] tracking-[-0.06em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
                >
                  <span>{artist.name}</span>
                  {artist.is_verified ? (
                    <BadgeCheck
                      className='h-7 w-7 shrink-0'
                      fill='#3b82f6'
                      stroke='white'
                      strokeWidth={2}
                    />
                  ) : null}
                </Link>
                <p className='max-w-[32rem] text-[17px] leading-8 text-white/76'>
                  {heroSubtitle}
                </p>
              </div>

              <div className='flex flex-wrap items-center gap-3'>
                <ProfileInlineNotificationsCTA
                  artist={artist}
                  portalContainer={notificationsPortalContainer}
                  variant='hero'
                  presentation='modal'
                  onManageNotifications={() => onModeSelect('subscribe')}
                />
                <span className='inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--profile-status-pill-border)] bg-[color:var(--profile-status-pill-bg)] px-4 text-[13px] font-semibold tracking-[-0.01em] text-white'>
                  <span className='h-2 w-2 rounded-full bg-[color:var(--profile-accent-primary)]' />
                  <span>{statusLabel}</span>
                </span>
                {heroRoleLabel ? (
                  <span className='inline-flex h-11 items-center rounded-full border border-white/10 bg-black/18 px-4 text-[13px] font-medium tracking-[-0.01em] text-white/62 backdrop-blur-xl'>
                    {heroRoleLabel}
                  </span>
                ) : null}
              </div>

              {visibleSocialLinks.length > 0 ? (
                <div className='flex items-center gap-3.5'>
                  {visibleSocialLinks.map(link =>
                    link.platform && link.url ? (
                      <a
                        key={link.id}
                        href={link.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white shadow-[0_16px_36px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-colors duration-200 hover:bg-black/34'
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
        </section>

        <div className='grid gap-3.5 xl:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]'>
          <DesktopSurfaceCard
            title='All Shows'
            actionLabel='View all shows'
            onAction={() => onModeSelect('tour')}
          >
            <div className='space-y-2'>
              {upcomingTourDates.slice(0, 5).map(tourDate => (
                <div
                  key={tourDate.id}
                  className='grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-white/8 bg-white/[0.02] px-4 py-3'
                >
                  <div className='rounded-[16px] border border-[color:var(--profile-status-pill-border)] bg-[color:var(--profile-status-pill-bg)] px-2 py-2 text-center'>
                    <div className='text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--profile-accent-primary)]'>
                      {formatMonth(tourDate.startDate)}
                    </div>
                    <div className='mt-1 text-[24px] font-semibold leading-none tracking-[-0.05em] text-white'>
                      {formatDay(tourDate.startDate)}
                    </div>
                  </div>
                  <div className='min-w-0'>
                    <p className='truncate text-[18px] font-medium tracking-[-0.03em] text-white'>
                      {tourDate.venueName}
                    </p>
                    <p className='truncate text-[14px] text-white/48'>
                      {[tourDate.city, tourDate.region]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                  {tourDate.ticketUrl ? (
                    <a
                      href={tourDate.ticketUrl}
                      className='inline-flex h-10 items-center rounded-full border border-white/12 px-4 text-[13px] font-medium text-white/82 transition-colors duration-200 hover:bg-white/[0.04]'
                    >
                      Tickets
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </DesktopSurfaceCard>

          <DesktopSurfaceCard
            title='All Releases'
            actionLabel='View all releases'
            onAction={() => onModeSelect('listen')}
          >
            <div className='space-y-2'>
              {visibleReleases.slice(0, 4).map(release => (
                <a
                  key={release.id}
                  href={
                    release.slug
                      ? `/${artist.handle}/${release.slug}`
                      : undefined
                  }
                  className='grid grid-cols-[56px_minmax(0,1fr)_40px_28px] items-center gap-3 rounded-[20px] border border-white/8 bg-white/[0.02] px-3 py-3 transition-colors duration-200 hover:bg-white/[0.04]'
                >
                  <div className='relative h-14 w-14 overflow-hidden rounded-[16px]'>
                    <ImageWithFallback
                      src={release.artworkUrl}
                      alt={release.title}
                      fill
                      sizes='56px'
                      className='object-cover'
                    />
                  </div>
                  <div className='min-w-0'>
                    <p className='truncate text-[17px] font-medium tracking-[-0.03em] text-white'>
                      {release.title}
                    </p>
                    <p className='truncate text-[13px] text-white/44'>
                      {formatReleaseMeta(
                        release.releaseType,
                        release.releaseDate
                      )}
                    </p>
                  </div>
                  <span className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/28 text-white'>
                    <Play className='ml-0.5 h-4 w-4 fill-current' />
                  </span>
                  <span className='flex items-center gap-[3px] text-white/30'>
                    <span className='h-[3px] w-[3px] rounded-full bg-current' />
                    <span className='h-[3px] w-[3px] rounded-full bg-current' />
                    <span className='h-[3px] w-[3px] rounded-full bg-current' />
                  </span>
                </a>
              ))}
            </div>
          </DesktopSurfaceCard>
        </div>
      </div>

      <div className='grid min-h-0 gap-3.5'>
        <DesktopSurfaceCard title='Latest Release'>
          <div className='flex gap-4'>
            <div className='relative h-[128px] w-[128px] overflow-hidden rounded-[22px]'>
              <ImageWithFallback
                src={latestVisibleRelease?.artworkUrl}
                alt={latestVisibleRelease?.title ?? artist.name}
                fill
                sizes='128px'
                className='object-cover'
              />
            </div>
            <div className='min-w-0 flex-1 space-y-4'>
              <div className='space-y-1.5'>
                <p className='truncate text-[18px] font-semibold tracking-[-0.03em] text-white'>
                  {latestVisibleRelease?.title ?? 'Latest release'}
                </p>
                <p className='text-[14px] text-white/48'>
                  {formatReleaseMeta(
                    latestVisibleRelease?.releaseType,
                    latestVisibleRelease?.releaseDate
                  )}
                </p>
              </div>
              <div className='flex flex-wrap items-center gap-2.5'>
                <button
                  type='button'
                  onClick={onPlayClick}
                  className='inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-black/32 text-white transition-colors duration-200 hover:bg-black/48'
                  aria-label='Play'
                >
                  <Play className='ml-0.5 h-4 w-4 fill-current' />
                </button>
                {latestVisibleRelease?.slug ? (
                  <a
                    href={`/${artist.handle}/${latestVisibleRelease.slug}`}
                    className='inline-flex h-11 items-center rounded-full border border-white/12 px-4 text-[14px] font-medium text-white/84 transition-colors duration-200 hover:bg-white/[0.04]'
                  >
                    View release
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </DesktopSurfaceCard>

        <DesktopSurfaceCard title='More Music'>
          <div className='grid grid-cols-3 gap-3'>
            {visibleReleases.slice(0, 3).map(release => (
              <a
                key={release.id}
                href={
                  release.slug ? `/${artist.handle}/${release.slug}` : undefined
                }
              >
                <div className='relative aspect-[0.95] overflow-hidden rounded-[22px] border border-white/8'>
                  <ImageWithFallback
                    src={release.artworkUrl}
                    alt={release.title}
                    fill
                    sizes='180px'
                    className='object-cover'
                  />
                </div>
                <p className='mt-3 truncate text-[16px] font-medium tracking-[-0.025em] text-white'>
                  {release.title}
                </p>
                <p className='mt-1 truncate text-[13px] text-white/44'>
                  {formatReleaseMeta(release.releaseType, release.releaseDate)}
                </p>
              </a>
            ))}
          </div>
        </DesktopSurfaceCard>

        <DesktopSurfaceCard title='Alerts'>
          <div className='space-y-6'>
            <div className='space-y-1'>
              <p className='text-[13px] font-semibold tracking-[-0.01em] text-white/44'>
                Sent from Jovie
              </p>
              <p className='text-[14px] leading-6 text-white/58'>
                Jovie Alerts are concise, one-time, verified notifications to
                your email about verified new releases of music and shows.
              </p>
            </div>
            <div className='space-y-4'>
              {[
                { key: 'newMusic', label: 'New Music', icon: Music2 },
                { key: 'tourDates', label: 'Shows', icon: CalendarDays },
                { key: 'merch', label: 'Merch', icon: Disc3 },
              ].map(item => {
                const Icon = item.icon;
                const checked = Boolean(
                  contentPrefs[item.key as NotificationContentType]
                );
                return (
                  <div
                    key={item.key}
                    className='flex items-center justify-between gap-4'
                  >
                    <div className='flex items-center gap-3'>
                      <Icon className='h-4.5 w-4.5 text-white/68' />
                      <span className='text-[15px] font-medium tracking-[-0.015em] text-white/88'>
                        {item.label}
                      </span>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={() => onModeSelect('subscribe')}
                      aria-label={item.label}
                      className='data-[state=checked]:bg-[color:var(--profile-accent-primary)] data-[state=unchecked]:bg-white/14'
                    />
                  </div>
                );
              })}
            </div>
            {showArtistEmailRow ? (
              <>
                <div className='h-px bg-white/8' />
                <div className='space-y-3'>
                  <div className='space-y-1'>
                    <p className='text-[13px] font-semibold tracking-[-0.01em] text-white/44'>
                      Sent by {artist.name}
                    </p>
                    <p className='text-[14px] leading-6 text-white/58'>
                      Share your email with {artist.name} to receive occasional
                      emails about related things.
                    </p>
                  </div>
                  <div className='flex items-center justify-between gap-4'>
                    <div className='flex items-center gap-3'>
                      <Mail className='h-4.5 w-4.5 text-white/68' />
                      <span className='text-[15px] font-medium tracking-[-0.015em] text-white/88'>
                        Subscribe to Other Alerts
                      </span>
                    </div>
                    <Switch
                      checked={false}
                      onCheckedChange={() => onModeSelect('subscribe')}
                      aria-label='Subscribe to other alerts'
                      className='data-[state=checked]:bg-[color:var(--profile-accent-primary)] data-[state=unchecked]:bg-white/14'
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </DesktopSurfaceCard>
      </div>
    </div>
  );

  const nonHomeContent =
    activePrimaryTab === 'listen' ? (
      <div className='grid min-h-0 flex-1 gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_360px]'>
        <DesktopSurfaceCard title='Releases' className='min-h-0'>
          <ReleasesView
            releases={visibleReleases}
            artistHandle={artist.handle}
            artistName={artist.name}
          />
        </DesktopSurfaceCard>
        <div className='grid gap-3.5'>
          <DesktopSurfaceCard title='Latest Release'>
            <div className='space-y-4'>
              <div className='relative aspect-square overflow-hidden rounded-[22px] border border-white/8'>
                <ImageWithFallback
                  src={latestVisibleRelease?.artworkUrl}
                  alt={latestVisibleRelease?.title ?? artist.name}
                  fill
                  sizes='320px'
                  className='object-cover'
                />
              </div>
              <div>
                <p className='text-[20px] font-semibold tracking-[-0.03em] text-white'>
                  {latestVisibleRelease?.title ?? 'Latest release'}
                </p>
                <p className='mt-1 text-[14px] text-white/48'>
                  {formatReleaseMeta(
                    latestVisibleRelease?.releaseType,
                    latestVisibleRelease?.releaseDate
                  )}
                </p>
              </div>
            </div>
          </DesktopSurfaceCard>
          <DesktopSurfaceCard
            title='Support'
            actionLabel='Open support'
            onAction={() => onDrawerViewChange('pay')}
          >
            <button
              type='button'
              onClick={() => onDrawerViewChange('pay')}
              className='inline-flex h-12 items-center rounded-full border border-white/12 px-4 text-[14px] font-medium text-white/84 transition-colors duration-200 hover:bg-white/[0.04]'
            >
              Support {artist.name}
            </button>
          </DesktopSurfaceCard>
        </div>
      </div>
    ) : activePrimaryTab === 'tour' ? (
      <DesktopSurfaceCard title='All Shows' className='flex-1'>
        <div className='space-y-2'>
          {upcomingTourDates.map(tourDate => (
            <div
              key={tourDate.id}
              className='grid grid-cols-[68px_minmax(0,1fr)_auto] items-center gap-4 rounded-[22px] border border-white/8 bg-white/[0.02] px-4 py-3'
            >
              <div className='rounded-[18px] border border-[color:var(--profile-status-pill-border)] bg-[color:var(--profile-status-pill-bg)] px-2 py-3 text-center'>
                <div className='text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--profile-accent-primary)]'>
                  {formatMonth(tourDate.startDate)}
                </div>
                <div className='mt-1 text-[28px] font-semibold leading-none tracking-[-0.05em] text-white'>
                  {formatDay(tourDate.startDate)}
                </div>
              </div>
              <div className='min-w-0'>
                <p className='truncate text-[20px] font-medium tracking-[-0.03em] text-white'>
                  {tourDate.venueName}
                </p>
                <div className='mt-1 flex items-center gap-2 text-[14px] text-white/48'>
                  <MapPin className='h-4 w-4' />
                  <span className='truncate'>
                    {[tourDate.city, tourDate.region]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              </div>
              <a
                href={tourDate.ticketUrl ?? undefined}
                className='inline-flex h-11 items-center rounded-full border border-white/12 px-4 text-[14px] font-medium text-white/84 transition-colors duration-200 hover:bg-white/[0.04]'
              >
                Tickets
              </a>
            </div>
          ))}
        </div>
      </DesktopSurfaceCard>
    ) : activePrimaryTab === 'about' ? (
      <DesktopSurfaceCard title='Profile' className='flex-1'>
        <AboutSection
          artist={artist}
          genres={genres}
          pressPhotos={pressPhotos}
          allowPhotoDownloads={allowPhotoDownloads}
        />
      </DesktopSurfaceCard>
    ) : (
      homeOverview
    );

  return (
    <div className='relative flex h-[min(940px,calc(100dvh-48px))] w-full overflow-hidden rounded-[36px] border border-white/8 bg-[rgba(8,10,14,0.9)] shadow-[0_48px_120px_rgba(0,0,0,0.42)]'>
      <div
        ref={setNotificationsPortalContainer}
        className='relative flex min-h-0 w-full'
        data-testid='profile-desktop-surface'
      >
        <aside className='flex w-[88px] shrink-0 flex-col items-center border-r border-white/8 bg-[rgba(6,8,11,0.92)] px-4 py-5'>
          <div className='mb-7 flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.03]'>
            <BrandLogo size={26} rounded={false} />
          </div>
          <nav
            className='flex w-full flex-col items-center gap-2'
            aria-label='Profile navigation'
          >
            {PRIMARY_TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activePrimaryTab === tab.mode;
              return (
                <button
                  key={tab.mode}
                  type='button'
                  onClick={() => onModeSelect(tab.mode)}
                  className={cn(
                    'group relative flex h-12 w-12 items-center justify-center rounded-[18px] transition-colors duration-200',
                    isActive
                      ? 'bg-white/[0.06] text-white shadow-[inset_0_0_0_1px_var(--profile-status-pill-border)]'
                      : 'text-white/46 hover:bg-white/[0.035] hover:text-white/78'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={tab.label}
                  title={tab.label}
                >
                  <Icon
                    className={cn(
                      'h-[19px] w-[19px] shrink-0 transition-colors duration-200',
                      isActive && 'text-[color:var(--profile-accent-primary)]'
                    )}
                  />
                  <span className='sr-only'>{tab.label}</span>
                  {isActive ? (
                    <span className='absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--profile-accent-primary)] shadow-[0_0_14px_var(--profile-accent-primary)]' />
                  ) : null}
                  <span className='pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-white/82 opacity-0 shadow-[0_18px_48px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-opacity duration-150 group-hover:opacity-100 xl:block'>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className='mt-auto flex flex-col items-center gap-4 pt-6'>
            <div className='relative h-10 w-10 overflow-hidden rounded-full border border-white/12'>
              <ImageWithFallback
                src={heroImageUrl}
                alt={artist.name}
                fill
                sizes='40px'
                className='object-cover'
              />
            </div>
          </div>
        </aside>

        <div className='relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]'>
          <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />
          <div className='relative z-10 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain p-3.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
            {nonHomeContent}
          </div>
        </div>

        {activePrimaryTab === 'subscribe' ? (
          <ProfileInlineNotificationsCTA
            artist={artist}
            presentation='modal'
            portalContainer={notificationsPortalContainer}
            autoOpen
            hideTrigger
            onFlowClosed={onAlertsModalClose}
          />
        ) : null}

        <ProfileUnifiedDrawer
          open={drawerOpen}
          onOpenChange={onDrawerOpenChange}
          view={drawerView}
          onViewChange={onDrawerViewChange}
          artist={artist}
          socialLinks={socialLinks}
          contacts={contacts}
          primaryChannel={primaryChannel}
          dsps={mergedDSPs}
          isSubscribed={isSubscribed}
          contentPrefs={contentPrefs}
          onTogglePref={onTogglePref}
          onUnsubscribe={onUnsubscribe}
          isUnsubscribing={isUnsubscribing}
          shareContext={shareContext}
          hasTip={hasTip}
          hasContacts={hasContacts}
          genres={genres}
          pressPhotos={pressPhotos}
          allowPhotoDownloads={allowPhotoDownloads}
          tourDates={tourDates}
          hasReleases={hasReleases}
          releases={visibleReleases}
          presentation={presentation}
        />
      </div>
    </div>
  );
}
