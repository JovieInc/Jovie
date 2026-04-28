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
import { resolveProfileSurfaceState } from '@/features/profile/profile-surface-state';
import { ReleasesView } from '@/features/profile/views/ReleasesView';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import { readArtistEmailReadyFromSettings } from '@/lib/notifications/artist-email';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import { buildProfileShareContext } from '@/lib/share/context';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
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
        'rounded-[18px] border border-white/6 bg-white/[0.025] p-5',
        className
      )}
    >
      <div className='mb-4 flex items-center justify-between gap-4'>
        <h2 className='text-[16px] font-semibold tracking-[-0.02em] text-white'>
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

function EmptySurfaceBlock({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className='flex min-h-[120px] items-center rounded-[18px] bg-white/[0.025] px-4 text-[14px] leading-6 text-white/54'>
      {children}
    </div>
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
  const activePrimaryTab = getDesktopBaseMode(activeMode);
  const surfaceState = useMemo(
    () =>
      resolveProfileSurfaceState({
        artist,
        socialLinks,
        photoDownloadSizes,
        latestRelease,
        profileSettings,
        tourDates,
        releases,
        hasPlayableDestinations: mergedDSPs.length > 0,
        showPayButton,
        isSubscribed,
        activeSubtitle: latestRelease?.title ?? 'Artist profile',
        viewerCountryCode,
      }),
    [
      artist,
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
  const {
    heroImageUrl,
    heroSubtitle,
    latestVisibleRelease,
    visibleReleases,
    upcomingTourDates,
    primaryAction,
    statusPill,
    visibleSocialLinks,
    hasTip,
    hasReleases,
    emptyState,
  } = surfaceState;
  const shareContext = useMemo(
    () =>
      buildProfileShareContext({
        username: artist.handle,
        artistName: artist.name,
        avatarUrl: heroImageUrl,
      }),
    [artist.handle, artist.name, heroImageUrl]
  );
  const { primaryChannel, isEnabled: hasContacts } = useArtistContacts({
    contacts,
    artistHandle: artist.handle,
  });
  // The artist-email opt-in row should only appear when the artist has wired
  // up an email destination AND the visitor has actually subscribed —
  // otherwise the toggle is meaningless and confuses unsubscribed visitors.
  const artistEmailReady = readArtistEmailReadyFromSettings(artist.settings);
  const showArtistEmailRow = isSubscribed && artistEmailReady;
  const primaryActionControlClassName =
    'inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold tracking-[-0.01em] text-black transition-colors duration-200 hover:bg-white/88';
  const PrimaryActionIcon = primaryAction.kind === 'tour' ? CalendarDays : Play;
  let primaryActionElement: React.ReactNode;
  if (primaryAction.kind === 'subscribe') {
    primaryActionElement = (
      <ProfileInlineNotificationsCTA
        artist={artist}
        portalContainer={notificationsPortalContainer}
        variant='hero'
        presentation='modal'
        onManageNotifications={() => onModeSelect('subscribe')}
      />
    );
  } else if (primaryAction.href) {
    primaryActionElement = (
      <a href={primaryAction.href} className={primaryActionControlClassName}>
        <PrimaryActionIcon className='h-4 w-4' />
        {primaryAction.label}
      </a>
    );
  } else {
    primaryActionElement = (
      <button
        type='button'
        onClick={() => onModeSelect(primaryAction.mode)}
        className={primaryActionControlClassName}
      >
        <PrimaryActionIcon
          className={cn(
            'h-4 w-4',
            primaryAction.kind === 'listen' && 'fill-current'
          )}
        />
        {primaryAction.label}
      </button>
    );
  }

  const homeOverview = (
    <div className='grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.9fr)]'>
      <div className='grid min-h-0 gap-3.5'>
        <section className='relative min-h-[548px] overflow-hidden rounded-[26px] bg-[#0a0c10]'>
          <div className='absolute inset-0'>
            {heroImageUrl ? (
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
            ) : (
              <div
                className='h-full w-full bg-[radial-gradient(circle_at_44%_18%,rgba(255,255,255,0.08),transparent_30%),linear-gradient(145deg,#20242c_0%,#11141a_46%,#050608_100%)]'
                aria-hidden='true'
              />
            )}
          </div>
          <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,8,0.14)_0%,rgba(7,8,10,0.38)_42%,rgba(7,8,10,0.98)_100%)]' />
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_22%)]' />
          <div className='relative z-10 flex h-full flex-col justify-between p-7'>
            <div aria-hidden='true' />

            <div className='space-y-5'>
              <div className='space-y-2.5'>
                <Link
                  href={profileHref}
                  className='inline-flex max-w-[820px] items-start gap-2 rounded-md text-[clamp(3rem,6vw,5.75rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
                >
                  <span className='line-clamp-2'>{artist.name}</span>
                  {artist.is_verified ? (
                    <BadgeCheck
                      className='h-7 w-7 shrink-0'
                      fill='white'
                      stroke='black'
                      strokeWidth={2}
                    />
                  ) : null}
                </Link>
                <p className='line-clamp-2 max-w-[34rem] text-[17px] leading-8 text-white/76'>
                  {heroSubtitle}
                </p>
              </div>

              <div className='flex flex-wrap items-center gap-2.5'>
                {primaryActionElement}
                <span className='inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 text-[12px] font-semibold tracking-[-0.01em] text-white/82'>
                  <span className='h-1.5 w-1.5 rounded-full bg-white/52' />
                  <span>{statusPill.label}</span>
                </span>
              </div>

              {visibleSocialLinks.length > 0 ? (
                <div className='flex items-center gap-3'>
                  {visibleSocialLinks.map(link =>
                    link.platform && link.url ? (
                      <a
                        key={link.id}
                        href={link.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex h-10 w-10 items-center justify-center rounded-full text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] transition-opacity duration-200 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
                        aria-label={link.platform}
                      >
                        <SocialIcon
                          platform={link.platform}
                          className='h-[17px] w-[17px]'
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
              {upcomingTourDates.length > 0 ? (
                upcomingTourDates.slice(0, 5).map(tourDate => (
                  <div
                    key={tourDate.id}
                    className='grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] bg-white/[0.025] px-3 py-3'
                  >
                    <div className='rounded-[13px] border border-white/10 bg-white/[0.07] px-2 py-2 text-center'>
                      <div className='text-[10px] font-semibold tracking-[0.01em] text-white/58'>
                        {formatMonth(tourDate.startDate)}
                      </div>
                      <div className='mt-1 text-[22px] font-semibold leading-none tracking-[-0.05em] text-white'>
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
                        className='inline-flex h-9 items-center rounded-full border border-white/12 px-3 text-[12px] font-medium text-white/82 transition-colors duration-200 hover:bg-white/[0.04]'
                      >
                        Tickets
                      </a>
                    ) : null}
                  </div>
                ))
              ) : (
                <EmptySurfaceBlock>{emptyState.tour}</EmptySurfaceBlock>
              )}
            </div>
          </DesktopSurfaceCard>

          <DesktopSurfaceCard
            title='All Releases'
            actionLabel='View all releases'
            onAction={() => onModeSelect('listen')}
          >
            <div className='space-y-2'>
              {visibleReleases.length > 0 ? (
                visibleReleases.slice(0, 4).map(release => (
                  <a
                    key={release.id}
                    href={
                      release.slug
                        ? `/${artist.handle}/${release.slug}`
                        : undefined
                    }
                    className='grid grid-cols-[56px_minmax(0,1fr)_40px_28px] items-center gap-3 rounded-[18px] bg-white/[0.025] px-3 py-3 transition-colors duration-200 hover:bg-white/[0.04]'
                  >
                    <div className='relative h-14 w-14 overflow-hidden rounded-[14px]'>
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
                ))
              ) : (
                <EmptySurfaceBlock>{emptyState.release}</EmptySurfaceBlock>
              )}
            </div>
          </DesktopSurfaceCard>
        </div>
      </div>

      <div className='grid min-h-0 gap-3.5'>
        <DesktopSurfaceCard title='Latest Release'>
          {latestVisibleRelease ? (
            <div className='flex gap-4'>
              <div className='relative h-[128px] w-[128px] overflow-hidden rounded-[20px]'>
                <ImageWithFallback
                  src={latestVisibleRelease.artworkUrl}
                  alt={latestVisibleRelease.title}
                  fill
                  sizes='128px'
                  className='object-cover'
                />
              </div>
              <div className='min-w-0 flex-1 space-y-4'>
                <div className='space-y-1.5'>
                  <p className='truncate text-[18px] font-semibold tracking-[-0.03em] text-white'>
                    {latestVisibleRelease.title}
                  </p>
                  <p className='text-[14px] text-white/48'>
                    {formatReleaseMeta(
                      latestVisibleRelease.releaseType,
                      latestVisibleRelease.releaseDate
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
                  {latestVisibleRelease.slug ? (
                    <a
                      href={`/${artist.handle}/${latestVisibleRelease.slug}`}
                      className='inline-flex h-11 items-center rounded-full border border-white/12 px-4 text-[14px] font-medium text-white/84 transition-colors duration-200 hover:bg-white/[0.04]'
                    >
                      View Release
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <EmptySurfaceBlock>{emptyState.release}</EmptySurfaceBlock>
          )}
        </DesktopSurfaceCard>

        <DesktopSurfaceCard title='More Music'>
          {visibleReleases.length > 0 ? (
            <div className='grid grid-cols-3 gap-3'>
              {visibleReleases.slice(0, 3).map(release => (
                <a
                  key={release.id}
                  href={
                    release.slug
                      ? `/${artist.handle}/${release.slug}`
                      : undefined
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
                    {formatReleaseMeta(
                      release.releaseType,
                      release.releaseDate
                    )}
                  </p>
                </a>
              ))}
            </div>
          ) : (
            <EmptySurfaceBlock>{emptyState.homeProof}</EmptySurfaceBlock>
          )}
        </DesktopSurfaceCard>

        <DesktopSurfaceCard title='Alerts'>
          <div className='space-y-4'>
            <div className='space-y-3'>
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
                      <Icon className='size-4 text-white/62' />
                      <span className='text-[14px] font-medium tracking-[-0.015em] text-white/84'>
                        {item.label}
                      </span>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={() => onModeSelect('subscribe')}
                      aria-label={item.label}
                      className='data-[state=checked]:bg-white/36 data-[state=unchecked]:bg-white/14'
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
                      <Mail className='size-4 text-white/62' />
                      <span className='text-[14px] font-medium tracking-[-0.015em] text-white/84'>
                        Subscribe to Other Alerts
                      </span>
                    </div>
                    <Switch
                      checked={isSubscribed}
                      onCheckedChange={() => onModeSelect('subscribe')}
                      aria-label='Subscribe to other alerts'
                      className='data-[state=checked]:bg-white/36 data-[state=unchecked]:bg-white/14'
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
          {visibleReleases.length > 0 ? (
            <ReleasesView
              releases={visibleReleases}
              artistHandle={artist.handle}
              artistName={artist.name}
            />
          ) : (
            <EmptySurfaceBlock>{emptyState.release}</EmptySurfaceBlock>
          )}
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
          {hasTip ? (
            <DesktopSurfaceCard
              title='Support'
              actionLabel='Open Support'
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
          ) : null}
        </div>
      </div>
    ) : activePrimaryTab === 'tour' ? (
      <DesktopSurfaceCard title='All Shows' className='flex-1'>
        <div className='space-y-2'>
          {upcomingTourDates.length > 0 ? (
            upcomingTourDates.map(tourDate => (
              <div
                key={tourDate.id}
                className='grid grid-cols-[68px_minmax(0,1fr)_auto] items-center gap-4 rounded-[20px] bg-white/[0.025] px-4 py-3'
              >
                <div className='rounded-[14px] border border-white/10 bg-white/[0.07] px-2 py-2.5 text-center'>
                  <div className='text-[10px] font-semibold tracking-[0.01em] text-white/58'>
                    {formatMonth(tourDate.startDate)}
                  </div>
                  <div className='mt-1 text-[26px] font-semibold leading-none tracking-[-0.05em] text-white'>
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
                {tourDate.ticketUrl ? (
                  <a
                    href={tourDate.ticketUrl}
                    className='inline-flex h-11 items-center rounded-full border border-white/12 px-4 text-[14px] font-medium text-white/84 transition-colors duration-200 hover:bg-white/[0.04]'
                  >
                    Tickets
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <EmptySurfaceBlock>{emptyState.tour}</EmptySurfaceBlock>
          )}
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
    <div className='relative flex h-[min(940px,calc(100dvh-48px))] w-full overflow-hidden rounded-[28px] bg-[rgba(8,10,14,0.76)]'>
      <div
        ref={setNotificationsPortalContainer}
        className='relative flex min-h-0 w-full flex-col'
        data-testid='profile-desktop-surface'
      >
        <div className='relative z-20 flex shrink-0 items-center justify-between gap-4 px-5 pt-5'>
          <nav
            className='flex min-w-0 items-center gap-1 rounded-full bg-black/24 p-1 backdrop-blur-xl'
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
                    'inline-flex h-10 min-w-0 items-center gap-2 rounded-full px-3 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-200',
                    isActive
                      ? 'bg-white/[0.1] text-white'
                      : 'text-white/50 hover:bg-white/[0.05] hover:text-white/78'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors duration-200',
                      isActive && 'text-white'
                    )}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <button
            type='button'
            onClick={onOpenMenu}
            className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/28 text-white backdrop-blur-xl transition-colors duration-200 hover:bg-black/44'
            aria-label='More options'
          >
            <MoreHorizontal className='h-5 w-5' />
          </button>
        </div>

        <div className='relative flex min-h-0 flex-1 flex-col overflow-hidden'>
          <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_34%)]' />
          <div className='relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-5 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
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
