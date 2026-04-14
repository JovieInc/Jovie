'use client';

import { BadgeCheck, MoreHorizontal, Play } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ReleaseCountdown } from '@/components/features/release/ReleaseCountdown';
import {
  ProfileNotificationsContext,
  useProfileShell,
} from '@/components/organisms/profile-shell';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import type { ProfileMode } from '@/features/profile/contracts';
import type { DrawerView } from '@/features/profile/ProfileUnifiedDrawer';
import {
  getProfileMode,
  getProfileModeHref,
} from '@/features/profile/registry';
import { SubscriptionConfirmedBanner } from '@/features/profile/SubscriptionConfirmedBanner';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import {
  useUnsubscribeNotificationsMutation,
  useUpdateContentPreferencesMutation,
} from '@/lib/queries';
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
    readonly revealDate?: Date | string | null;
    readonly releaseType: string;
  } | null;
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
  readonly visitTrackingToken?: string;
  readonly showSubscriptionConfirmedBanner?: boolean;
  readonly viewerCountryCode?: string | null;
}

function resolveDrawerView(
  mode: ProfileMode,
  options: {
    readonly hasContacts: boolean;
    readonly hasDSPs: boolean;
    readonly hasTip: boolean;
  }
): DrawerView | null {
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

function getModeFromLocation(fallbackMode: ProfileMode): ProfileMode {
  if (globalThis.window === undefined) {
    return fallbackMode;
  }

  const modeParam = new URLSearchParams(globalThis.location.search).get('mode');
  return modeParam === null ? fallbackMode : getProfileMode(modeParam);
}

function getModeFromDrawerView(view: DrawerView): ProfileMode | null {
  switch (view) {
    case 'about':
    case 'subscribe':
    case 'contact':
    case 'listen':
    case 'tip':
    case 'tour':
      return view;
    default:
      return null;
  }
}

export function ProfileCompactTemplate({
  mode,
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
  visitTrackingToken,
  showSubscriptionConfirmedBanner = false,
  viewerCountryCode,
}: ProfileCompactTemplateProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<DrawerView>('menu');
  const [requestedMode, setRequestedMode] = useState<ProfileMode>(() =>
    getModeFromLocation(mode)
  );
  const revealNotificationsRef = useRef<(() => void) | null>(null);
  const pendingInlineRevealRef = useRef(false);
  const initialLocationModeAlignedRef = useRef(false);
  const suppressNextHistorySyncRef = useRef(true);

  // Lock orientation to portrait on mobile
  useEffect(() => {
    const orientation = screen?.orientation as
      | (ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
          unlock?: () => void;
        })
      | undefined;
    if (!orientation?.lock) return;
    orientation.lock('portrait').catch(() => {
      // Not supported or not allowed — ignore silently
    });
    return () => {
      orientation.unlock?.();
    };
  }, []);

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
    if (globalThis.window === undefined) return null;
    return new URLSearchParams(globalThis.location.search).get('source');
  }, []);

  const { notificationsContextValue, notificationsController } =
    useProfileShell({
      artist,
      socialLinks,
      viewerCountryCode,
      contacts,
      visitTrackingToken,
      modeOverride: requestedMode,
      sourceOverride: initialSource,
      smsEnabled: enableDynamicEngagement,
    });

  const isSubscribed = Boolean(
    notificationsContextValue.subscribedChannels.email ||
      notificationsContextValue.subscribedChannels.sms
  );
  const subscriberEmail =
    notificationsContextValue.subscriptionDetails?.email ?? '';
  const subscriberPhone =
    notificationsContextValue.subscriptionDetails?.sms ?? '';
  const subscribedViaEmail = Boolean(
    notificationsContextValue.subscribedChannels.email
  );

  // Hydrate content preferences from server state
  const serverPrefs = notificationsController.contentPreferences;
  const [contentPrefs, setContentPrefs] = useState<
    Record<NotificationContentType, boolean>
  >({
    newMusic: serverPrefs?.newMusic ?? true,
    tourDates: serverPrefs?.tourDates ?? true,
    merch: serverPrefs?.merch ?? true,
    general: serverPrefs?.general ?? true,
  });

  // Re-sync when server preferences load
  useEffect(() => {
    if (serverPrefs) {
      setContentPrefs({
        newMusic: serverPrefs.newMusic ?? true,
        tourDates: serverPrefs.tourDates ?? true,
        merch: serverPrefs.merch ?? true,
        general: serverPrefs.general ?? true,
      });
    }
  }, [serverPrefs]);

  const prefsMutation = useUpdateContentPreferencesMutation();
  const unsubMutation = useUnsubscribeNotificationsMutation();
  const { success: showSuccess } = useNotifications();

  const handleTogglePref = useCallback(
    (key: NotificationContentType) => {
      const prev = contentPrefs[key];
      const next = !prev;
      setContentPrefs(state => ({ ...state, [key]: next }));
      prefsMutation.mutate(
        {
          artistId: artist.id,
          email: subscriberEmail || undefined,
          phone: subscriberPhone || undefined,
          preferences: { [key]: next },
        },
        {
          onError: () => {
            setContentPrefs(state => ({ ...state, [key]: prev }));
          },
        }
      );
    },
    [contentPrefs, artist.id, subscriberEmail, subscriberPhone, prefsMutation]
  );

  const handleUnsubscribe = useCallback(() => {
    const channel = subscribedViaEmail ? 'email' : 'sms';
    const identifier = subscribedViaEmail
      ? { email: subscriberEmail }
      : { phone: subscriberPhone };
    unsubMutation.mutate(
      {
        artistId: artist.id,
        channel,
        ...identifier,
      },
      {
        onSuccess: () => {
          notificationsContextValue.setSubscribedChannels({});
          notificationsContextValue.setSubscriptionDetails({});
          notificationsContextValue.setState('idle');
          setRequestedMode('profile');
          showSuccess('Notifications turned off');
        },
      }
    );
  }, [
    artist.id,
    subscribedViaEmail,
    subscriberEmail,
    subscriberPhone,
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
  const hasAbout = Boolean(
    artist.tagline ||
      artist.location ||
      artist.hometown ||
      artist.active_since_year ||
      (genres && genres.length > 0) ||
      (allowPhotoDownloads && pressPhotos.length > 0)
  );
  const searchSuffix = useMemo(() => {
    if (!initialSource) {
      return '';
    }

    return `source=${encodeURIComponent(initialSource)}`;
  }, [initialSource]);

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

  const resolveInitialView = useCallback(
    (nextMode: ProfileMode) =>
      resolveDrawerView(nextMode, {
        hasContacts,
        hasDSPs: mergedDSPs.length > 0,
        hasTip,
      }),
    [hasContacts, hasTip, mergedDSPs.length]
  );

  const syncRequestedModeFromLocation = useCallback(() => {
    setRequestedMode(currentMode => {
      const nextMode = getModeFromLocation(mode);
      if (currentMode !== nextMode) {
        suppressNextHistorySyncRef.current = true;
        initialLocationModeAlignedRef.current = false;
      }
      return nextMode;
    });
  }, [mode]);

  useEffect(() => {
    syncRequestedModeFromLocation();
  }, [mode, syncRequestedModeFromLocation]);

  useEffect(() => {
    if (requestedMode === getModeFromLocation(mode)) {
      initialLocationModeAlignedRef.current = true;
    }
  }, [mode, requestedMode]);

  useEffect(() => {
    // Subscribe mode: skip the drawer, reveal the inline CTA directly
    if (requestedMode === 'subscribe') {
      setDrawerView('menu');
      setDrawerOpen(false);
      pendingInlineRevealRef.current = true;
      if (revealNotificationsRef.current) {
        pendingInlineRevealRef.current = false;
        revealNotificationsRef.current();
      }
      // Reset so the URL cleanup effect runs and refresh doesn't re-trigger
      setRequestedMode(mode);
      return;
    }

    const resolved = resolveInitialView(requestedMode);
    if (resolved) {
      setDrawerView(resolved);
      setDrawerOpen(true);
    } else {
      setDrawerView('menu');
      setDrawerOpen(false);
    }
  }, [mode, requestedMode, resolveInitialView]);

  useEffect(() => {
    const handlePopState = () => {
      syncRequestedModeFromLocation();
    };

    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [syncRequestedModeFromLocation]);

  useEffect(() => {
    // During hydration, the server-rendered mode can briefly disagree with the
    // actual query string. Wait until the client has reconciled that first so
    // we do not strip deep-link modes like ?mode=subscribe.
    if (!initialLocationModeAlignedRef.current) {
      return;
    }

    if (suppressNextHistorySyncRef.current) {
      suppressNextHistorySyncRef.current = false;
      return;
    }

    const activeMode =
      drawerOpen && drawerView !== 'menu' && drawerView !== 'notifications'
        ? drawerView
        : null;
    const isHistoryModeSettled =
      requestedMode === 'profile'
        ? activeMode === null
        : activeMode === requestedMode;

    // In React StrictMode, mount effects run twice before the drawer state has
    // committed. Wait until the visual drawer state matches the requested mode
    // so we do not collapse deep links like ?mode=subscribe back to /handle.
    if (!isHistoryModeSettled) {
      return;
    }

    const href =
      activeMode === null
        ? getProfileModeHref(artist.handle, 'profile', searchSuffix)
        : getProfileModeHref(artist.handle, activeMode, searchSuffix);
    const currentHref = `${globalThis.location.pathname}${globalThis.location.search}`;
    if (currentHref === href) {
      return;
    }

    globalThis.history.pushState(globalThis.history.state, '', href);
  }, [drawerOpen, drawerView, requestedMode, artist.handle, searchSuffix]);

  const ticketlessTourHref = useMemo(
    () => getProfileModeHref(artist.handle, 'tour', searchSuffix),
    [artist.handle, searchSuffix]
  );
  const profileHref = useMemo(
    () => getProfileModeHref(artist.handle, 'profile', searchSuffix),
    [artist.handle, searchSuffix]
  );

  const openDrawerMode = useCallback((nextView: DrawerView) => {
    const nextMode = getModeFromDrawerView(nextView);
    if (nextMode) {
      setRequestedMode(nextMode);
      return;
    }

    suppressNextHistorySyncRef.current = true;
    setDrawerView(nextView);
    setDrawerOpen(true);
  }, []);

  const handleDrawerOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setRequestedMode('profile');
      return;
    }

    setDrawerOpen(true);
  }, []);

  const handleDrawerViewChange = useCallback((nextView: DrawerView) => {
    const nextMode = getModeFromDrawerView(nextView);
    if (nextMode) {
      setRequestedMode(nextMode);
      return;
    }

    suppressNextHistorySyncRef.current = true;
    setDrawerView(nextView);
    setDrawerOpen(true);
  }, []);

  const handlePlayClick = useCallback(() => {
    if (mergedDSPs.length === 0) {
      openDrawerMode('subscribe');
      return;
    }
    openDrawerMode('listen');
  }, [mergedDSPs.length, openDrawerMode]);

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
    setRequestedMode('profile');
  }, [artist.handle, artist.name]);

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <div className='profile-viewport relative h-[100dvh] overflow-clip bg-[color:var(--profile-stage-bg)] text-primary-token md:h-auto md:min-h-[100dvh] md:overflow-x-hidden'>
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
        <div className='relative mx-auto flex h-[100dvh] w-full max-w-[680px] items-stretch justify-center md:h-auto md:min-h-[100dvh] md:items-center md:px-6 md:py-8'>
          <main className='relative flex w-full items-stretch md:items-center'>
            <div
              className='relative flex h-full w-full max-w-(--profile-shell-max-width) flex-col overflow-clip bg-[color:var(--profile-content-bg)] md:h-auto md:min-h-0 md:mx-auto md:overflow-hidden md:rounded-[var(--profile-shell-card-radius)] md:border md:border-[color:var(--profile-panel-border)] md:shadow-[var(--profile-panel-shadow)]'
              data-testid='profile-compact-shell'
            >
              <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />

              {/* ─── Hero ─── */}
              <header className='relative w-full min-h-0 flex-1 md:flex-none md:aspect-[4/5]'>
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
                  <Link
                    href={APP_ROUTES.ARTIST_PROFILES}
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

                  <div className='flex items-center gap-2'>
                    <button
                      type='button'
                      onClick={() => openDrawerMode('menu')}
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${glass.border} bg-black/25 text-white/70 ${glass.blur} transition-colors duration-150 hover:bg-black/40`}
                      aria-label='More options'
                      aria-haspopup='dialog'
                    >
                      <MoreHorizontal className='h-[15px] w-[15px]' />
                    </button>
                  </div>
                </div>

                {/* Artist name + play */}
                <div className='absolute inset-x-0 bottom-5 z-10 flex items-end justify-between px-5'>
                  <h1 className='min-w-0'>
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
                      onClick={handlePlayClick}
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
                      href={nextTourDate.ticketUrl ?? ticketlessTourHref}
                      target={nextTourDate.ticketUrl ? '_blank' : undefined}
                      rel={
                        nextTourDate.ticketUrl
                          ? 'noopener noreferrer'
                          : undefined
                      }
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
                      onClick={handlePlayClick}
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

                <ProfileInlineNotificationsCTA
                  artist={artist}
                  onManageNotifications={() => openDrawerMode('notifications')}
                  onRegisterReveal={fn => {
                    revealNotificationsRef.current = fn;
                    if (pendingInlineRevealRef.current) {
                      pendingInlineRevealRef.current = false;
                      fn();
                    }
                  }}
                />

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

        <ProfileUnifiedDrawer
          open={drawerOpen}
          onOpenChange={handleDrawerOpenChange}
          view={drawerView}
          onViewChange={handleDrawerViewChange}
          artist={artist}
          socialLinks={socialLinks}
          contacts={availableContacts}
          primaryChannel={primaryChannel}
          dsps={mergedDSPs}
          isSubscribed={isSubscribed}
          contentPrefs={contentPrefs}
          onTogglePref={handleTogglePref}
          onUnsubscribe={handleUnsubscribe}
          isUnsubscribing={unsubMutation.isPending}
          onShare={handleShare}
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
          onRevealNotifications={() => {
            revealNotificationsRef.current?.();
          }}
        />
      </div>
    </ProfileNotificationsContext.Provider>
  );
}
