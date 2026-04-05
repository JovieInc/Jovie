'use client';

import {
  BadgeCheck,
  Bell,
  BellOff,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Info,
  Mail,
  MoreHorizontal,
  Play,
  Share2,
  Ticket,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  ProfileNotificationsContext,
  useProfileShell,
} from '@/components/organisms/profile-shell';
import { BASE_URL } from '@/constants/app';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import type { ProfileMode } from '@/features/profile/contracts';
import type { ProfileDrawerMode } from '@/features/profile/ProfileModeDrawer';
import {
  getProfileMode,
  getProfileModeHref,
} from '@/features/profile/registry';
import { SubscriptionConfirmedBanner } from '@/features/profile/SubscriptionConfirmedBanner';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import {
  useUnsubscribeNotificationsMutation,
  useUpdateContentPreferencesMutation,
} from '@/lib/queries';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import { getHeaderSocialLinks } from '@/lib/utils/context-aware-links';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import {
  NOTIFICATION_CONTENT_TYPES,
  type NotificationContentType,
} from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';

const ProfileModeDrawer = dynamic(
  () =>
    import('@/features/profile/ProfileModeDrawer').then(mod => ({
      default: mod.ProfileModeDrawer,
    })),
  { ssr: false }
);

const ProfileInlineNotificationsCTA = dynamic(
  () =>
    import('@/features/profile/artist-notifications-cta').then(mod => ({
      default: mod.ProfileInlineNotificationsCTA,
    })),
  { ssr: false }
);

/* ─── Design tokens (aligned with DESIGN.md System B dark) ─── */
const glass = {
  bg: 'bg-white/[0.05]',
  bgHover: 'hover:bg-white/[0.08]',
  border: 'border-white/[0.08]',
  shadow:
    'shadow-[inset_0_0.5px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.2)]',
  blur: 'backdrop-blur-2xl',
} as const;

interface ProfileCompactTemplateProps {
  readonly mode: ProfileMode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly latestRelease?: {
    readonly title: string;
    readonly slug: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: Date | string | null;
    readonly releaseType: string;
  } | null;
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly tourDates?: TourDateViewModel[];
  readonly visitTrackingToken?: string;
  readonly showSubscriptionConfirmedBanner?: boolean;
  readonly viewerCountryCode?: string | null;
}

function resolveDrawerMode(
  mode: ProfileMode,
  options: {
    readonly hasContacts: boolean;
    readonly hasDSPs: boolean;
    readonly hasTip: boolean;
  }
): ProfileDrawerMode | null {
  switch (mode) {
    case 'about':
    case 'subscribe':
      return mode;
    case 'contact':
      return options.hasContacts ? mode : null;
    case 'listen':
      return options.hasDSPs ? mode : null;
    case 'tip':
      return options.hasTip ? mode : null;
    case 'tour':
      return mode;
    case 'profile':
    default:
      return null;
  }
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

export function ProfileCompactTemplate({
  mode,
  artist,
  socialLinks,
  contacts,
  latestRelease,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  photoDownloadSizes = [],
  tourDates = [],
  visitTrackingToken,
  showSubscriptionConfirmedBanner = false,
  viewerCountryCode,
}: ProfileCompactTemplateProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifSubMenu, setNotifSubMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const initialSource = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(globalThis.location.search).get('source');
  }, []);

  const { notificationsContextValue } = useProfileShell({
    artist,
    socialLinks,
    viewerCountryCode,
    contacts,
    visitTrackingToken,
    modeOverride: mode,
    sourceOverride: initialSource,
  });

  const isSubscribed = Boolean(
    notificationsContextValue.subscribedChannels.email ||
      notificationsContextValue.subscribedChannels.sms
  );
  const subscriberEmail =
    notificationsContextValue.subscriptionDetails?.email ?? '';

  const [contentPrefs, setContentPrefs] = useState<
    Record<NotificationContentType, boolean>
  >({
    newMusic: true,
    tourDates: true,
    merch: true,
    general: true,
  });
  const prefsMutation = useUpdateContentPreferencesMutation();
  const unsubMutation = useUnsubscribeNotificationsMutation();
  const { success: showSuccess } = useNotifications();

  const handleTogglePref = useCallback(
    (key: NotificationContentType) => {
      const next = !contentPrefs[key];
      setContentPrefs(prev => ({ ...prev, [key]: next }));
      prefsMutation.mutate({
        artistId: artist.id,
        email: subscriberEmail,
        preferences: { [key]: next },
      });
    },
    [contentPrefs, artist.id, subscriberEmail, prefsMutation]
  );

  const handleUnsubscribe = useCallback(() => {
    unsubMutation.mutate(
      {
        artistId: artist.id,
        email: subscriberEmail,
        channel: 'email',
      },
      {
        onSuccess: () => {
          notificationsContextValue.setSubscribedChannels({});
          notificationsContextValue.setState('idle');
          setMenuOpen(false);
          setNotifSubMenu(false);
          showSuccess('Notifications turned off');
        },
      }
    );
  }, [
    artist.id,
    subscriberEmail,
    unsubMutation,
    notificationsContextValue,
    showSuccess,
  ]);

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
  const searchSuffix = useMemo(() => {
    if (!initialSource) {
      return '';
    }

    return `source=${encodeURIComponent(initialSource)}`;
  }, [initialSource]);

  const nextTourDate = useMemo(() => {
    const now = Date.now();
    return (
      tourDates.find(td => new Date(td.startDate).getTime() >= now) ?? null
    );
  }, [tourDates]);

  const resolveActiveMode = useCallback(
    (nextMode: ProfileMode) =>
      resolveDrawerMode(nextMode, {
        hasContacts,
        hasDSPs: mergedDSPs.length > 0,
        hasTip,
      }),
    [hasContacts, hasTip, mergedDSPs.length]
  );
  const [activeDrawerMode, setActiveDrawerMode] =
    useState<ProfileDrawerMode | null>(() => resolveActiveMode(mode));

  useEffect(() => {
    setActiveDrawerMode(resolveActiveMode(mode));
  }, [mode, resolveActiveMode]);

  useEffect(() => {
    const handlePopState = () => {
      const nextMode = getProfileMode(
        new URLSearchParams(globalThis.location.search).get('mode')
      );
      setActiveDrawerMode(resolveActiveMode(nextMode));
    };

    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [resolveActiveMode]);

  useEffect(() => {
    const href =
      activeDrawerMode === null
        ? getProfileModeHref(artist.handle, 'profile', searchSuffix)
        : getProfileModeHref(artist.handle, activeDrawerMode, searchSuffix);
    const currentHref = `${globalThis.location.pathname}${globalThis.location.search}`;
    if (currentHref === href) {
      return;
    }

    globalThis.history.pushState(globalThis.history.state, '', href);
  }, [activeDrawerMode, artist.handle, searchSuffix]);

  const ticketlessTourHref = useMemo(
    () => getProfileModeHref(artist.handle, 'tour', searchSuffix),
    [artist.handle, searchSuffix]
  );

  const openDrawerMode = useCallback((nextMode: ProfileDrawerMode) => {
    setActiveDrawerMode(nextMode);
    setMenuOpen(false);
  }, []);

  const handlePlayClick = useCallback(() => {
    if (mergedDSPs.length === 0) {
      setActiveDrawerMode('subscribe');
      return;
    }
    setActiveDrawerMode('listen');
  }, [mergedDSPs.length]);

  const handleShare = useCallback(async () => {
    const profileUrl = `${BASE_URL}/${artist.handle}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: artist.name, url: profileUrl });
      } else {
        await navigator.clipboard.writeText(profileUrl);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(profileUrl);
      } catch {
        // Silent failure
      }
    }
    setMenuOpen(false);
  }, [artist.handle, artist.name]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setNotifSubMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Close menu on escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (notifSubMenu) {
          setNotifSubMenu(false);
        } else {
          setMenuOpen(false);
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [menuOpen, notifSubMenu]);

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <div className='profile-viewport relative min-h-[100dvh] overflow-x-hidden bg-[color:var(--profile-stage-bg)] text-primary-token'>
        {/* ─── Ambient background ─── */}
        <div className='absolute inset-0' aria-hidden='true'>
          <div className='absolute inset-[-10%]'>
            <ImageWithFallback
              src={heroImageUrl}
              alt={`${artist.name} background`}
              fill
              sizes='100vw'
              className='scale-[1.05] object-cover opacity-28 blur-[84px] saturate-[0.88]'
              fallbackVariant='avatar'
              fallbackClassName='bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_48%)]'
            />
          </div>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_26%),linear-gradient(180deg,rgba(6,8,13,0.34)_0%,rgba(7,8,10,0.82)_42%,rgba(8,9,10,0.98)_100%)]' />
        </div>

        {/* ─── Card container ─── */}
        <div className='relative mx-auto flex min-h-[100dvh] w-full max-w-[680px] items-stretch justify-center md:items-center md:px-6 md:py-8'>
          <main className='relative flex w-full items-stretch md:items-center'>
            <div
              className='relative flex w-full max-w-[430px] flex-col bg-[color:var(--profile-content-bg)] md:mx-auto md:min-h-[min(920px,calc(100dvh-64px))] md:overflow-hidden md:rounded-[30px] md:border md:border-[color:var(--profile-panel-border)] md:shadow-[var(--profile-panel-shadow)]'
              data-testid='profile-compact-shell'
            >
              <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />

              {/* ─── Hero ─── */}
              <header
                className='relative w-full'
                style={{ aspectRatio: '4 / 5' }}
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

                {/* Top vignette */}
                <div className='pointer-events-none absolute inset-x-0 top-0 h-[36%] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0.15)_55%,transparent_100%)]' />
                {/* Bottom gradient */}
                <div className='pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(to_top,var(--profile-stage-bg)_0%,rgba(5,6,8,0.75)_45%,transparent_100%)]' />

                {/* Top bar */}
                <div
                  className='relative z-10 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),20px)]'
                  data-testid='profile-header'
                >
                  <BrandLogo
                    size={22}
                    tone='white'
                    rounded={false}
                    className='opacity-45 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]'
                    aria-hidden={false}
                  />

                  <div className='flex items-center gap-2'>
                    {/* ─── Dropdown ─── */}
                    <div ref={menuRef} className='relative'>
                      <button
                        type='button'
                        onClick={() => setMenuOpen(prev => !prev)}
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${glass.border} bg-black/25 text-white/70 ${glass.blur} transition-colors duration-150 hover:bg-black/40`}
                        aria-label='More options'
                        aria-expanded={menuOpen}
                        aria-haspopup='menu'
                      >
                        <MoreHorizontal className='h-[15px] w-[15px]' />
                      </button>

                      {menuOpen ? (
                        <div
                          className={`absolute right-0 top-full z-50 mt-1.5 min-w-[188px] overflow-hidden rounded-[14px] border ${glass.border} bg-black/75 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.5)] ${glass.blur}`}
                          role='menu'
                        >
                          <button
                            type='button'
                            role='menuitem'
                            className='flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-[450] text-white/85 transition-colors duration-150 hover:bg-white/[0.08]'
                            onClick={handleShare}
                          >
                            <Share2 className='h-[14px] w-[14px] text-white/50' />
                            Share Profile
                          </button>
                          <button
                            type='button'
                            role='menuitem'
                            className='flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-[450] text-white/85 transition-colors duration-150 hover:bg-white/[0.08]'
                            onClick={() => openDrawerMode('about')}
                          >
                            <Info className='h-[14px] w-[14px] text-white/50' />
                            About
                          </button>
                          {tourDates.length > 0 ? (
                            <button
                              type='button'
                              role='menuitem'
                              className='flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-[450] text-white/85 transition-colors duration-150 hover:bg-white/[0.08]'
                              onClick={() => openDrawerMode('tour')}
                            >
                              <CalendarDays className='h-[14px] w-[14px] text-white/50' />
                              Tour Dates
                            </button>
                          ) : null}
                          {hasTip ? (
                            <button
                              type='button'
                              role='menuitem'
                              className='flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-[450] text-white/85 transition-colors duration-150 hover:bg-white/[0.08]'
                              onClick={() => openDrawerMode('tip')}
                            >
                              <Ticket className='h-[14px] w-[14px] text-white/50' />
                              Tip
                            </button>
                          ) : null}
                          {hasContacts ? (
                            <button
                              type='button'
                              role='menuitem'
                              className='flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-[450] text-white/85 transition-colors duration-150 hover:bg-white/[0.08]'
                              onClick={() => {
                                openDrawerMode('contact');
                              }}
                            >
                              <Mail className='h-[14px] w-[14px] text-white/50' />
                              Contact
                            </button>
                          ) : null}
                          {isSubscribed ? (
                            <button
                              type='button'
                              role='menuitem'
                              className='flex w-full items-center justify-between gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-[450] text-white/85 transition-colors duration-150 hover:bg-white/[0.08]'
                              onClick={() => setNotifSubMenu(true)}
                            >
                              <span className='flex items-center gap-2.5'>
                                <Bell className='h-[14px] w-[14px] text-white/50' />
                                Notifications
                              </span>
                              <ChevronRight className='h-3 w-3 text-white/40' />
                            </button>
                          ) : (
                            <button
                              type='button'
                              role='menuitem'
                              className='flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-[450] text-white/85 transition-colors duration-150 hover:bg-white/[0.08]'
                              onClick={() => openDrawerMode('subscribe')}
                            >
                              <Bell className='h-[14px] w-[14px] text-white/50' />
                              Get Notified
                            </button>
                          )}
                        </div>
                      ) : null}

                      {/* Notification preferences sub-menu */}
                      {menuOpen && notifSubMenu ? (
                        <div
                          className={`absolute right-0 top-full z-50 mt-1.5 min-w-[220px] overflow-hidden rounded-[14px] border ${glass.border} bg-black/75 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.5)] ${glass.blur}`}
                          role='menu'
                        >
                          <button
                            type='button'
                            role='menuitem'
                            className='flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[12px] font-[500] text-white/60 transition-colors duration-150 hover:bg-white/[0.08]'
                            onClick={() => setNotifSubMenu(false)}
                          >
                            <ChevronLeft className='h-3 w-3' />
                            Back
                          </button>
                          <div className='mx-2 my-1 h-px bg-white/[0.08]' />
                          <p className='px-3 py-1.5 text-[11px] font-[560] uppercase tracking-[0.06em] text-white/40'>
                            Notify me about
                          </p>
                          {NOTIFICATION_CONTENT_TYPES.map(pref => (
                            <button
                              key={pref.key}
                              type='button'
                              role='menuitemcheckbox'
                              aria-checked={contentPrefs[pref.key]}
                              className='flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[13px] font-[450] text-white/85 transition-colors duration-150 hover:bg-white/[0.08]'
                              onClick={e => {
                                e.stopPropagation();
                                handleTogglePref(pref.key);
                              }}
                            >
                              <span>{pref.label}</span>
                              <span
                                className={`h-3 w-3 rounded-full border transition-colors ${
                                  contentPrefs[pref.key]
                                    ? 'border-green-400 bg-green-400'
                                    : 'border-white/30 bg-transparent'
                                }`}
                              />
                            </button>
                          ))}
                          <div className='mx-2 my-1 h-px bg-white/[0.08]' />
                          <button
                            type='button'
                            role='menuitem'
                            className='flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-[450] text-red-400/85 transition-colors duration-150 hover:bg-white/[0.08]'
                            onClick={handleUnsubscribe}
                            disabled={unsubMutation.isPending}
                          >
                            <BellOff className='h-[14px] w-[14px] text-red-400/50' />
                            {unsubMutation.isPending
                              ? 'Turning off…'
                              : 'Turn off notifications'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Artist name + play */}
                <div className='absolute inset-x-0 bottom-5 z-10 flex items-end justify-between px-5'>
                  <h1 className='flex min-w-0 items-center gap-1.5 text-[34px] font-[590] leading-[1.06] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]'>
                    {artist.name}
                    {artist.is_verified ? (
                      <BadgeCheck
                        className='h-5 w-5 shrink-0 drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)]'
                        fill='#3b82f6'
                        stroke='white'
                        strokeWidth={2}
                        aria-label='Verified'
                      />
                    ) : null}
                  </h1>
                  {mergedDSPs.length > 0 ? (
                    <button
                      type='button'
                      onClick={handlePlayClick}
                      className='mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-transform duration-150 hover:scale-[1.06] active:scale-95'
                      aria-label={`Play ${artist.name}`}
                    >
                      <Play className='ml-0.5 h-3.5 w-3.5 fill-current text-black/85' />
                    </button>
                  ) : null}
                </div>
              </header>

              {/* ─── Content ─── */}
              <div className='relative z-10 flex flex-col gap-3 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3'>
                {showSubscriptionConfirmedBanner ? (
                  <SubscriptionConfirmedBanner />
                ) : null}

                {latestRelease && mergedDSPs.length > 0 ? (
                  <button
                    type='button'
                    onClick={handlePlayClick}
                    className={`group flex w-full items-center gap-2.5 rounded-[14px] border ${glass.border} ${glass.bg} px-2.5 py-2 text-left ${glass.blur} transition-colors duration-150 ${glass.bgHover} active:scale-[0.985]`}
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
                    href={nextTourDate.ticketUrl ?? ticketlessTourHref}
                    target={nextTourDate.ticketUrl ? '_blank' : undefined}
                    rel={
                      nextTourDate.ticketUrl ? 'noopener noreferrer' : undefined
                    }
                    className={`group flex w-full items-center gap-2.5 rounded-[14px] border ${glass.border} ${glass.bg} px-3 py-2.5 text-left ${glass.blur} transition-colors duration-150 ${glass.bgHover} active:scale-[0.985]`}
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
                    onClick={handlePlayClick}
                    className={`group flex w-full items-center gap-2.5 rounded-[14px] border ${glass.border} ${glass.bg} px-3 py-2.5 text-left ${glass.blur} transition-colors duration-150 ${glass.bgHover} active:scale-[0.985]`}
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

                <ProfileInlineNotificationsCTA artist={artist} />

                {/* Social icons — flat, no chrome */}
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

                {/* Powered by */}
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
          </main>
        </div>

        <ProfileModeDrawer
          activeMode={activeDrawerMode}
          onOpenChange={open => {
            if (!open) {
              setActiveDrawerMode(null);
            }
          }}
          artist={artist}
          socialLinks={socialLinks}
          contacts={availableContacts}
          primaryChannel={primaryChannel}
          dsps={mergedDSPs}
          enableDynamicEngagement={enableDynamicEngagement}
          subscribeTwoStep={subscribeTwoStep}
          genres={genres}
          pressPhotos={pressPhotos}
          allowPhotoDownloads={allowPhotoDownloads}
          tourDates={tourDates}
        />
      </div>
    </ProfileNotificationsContext.Provider>
  );
}
