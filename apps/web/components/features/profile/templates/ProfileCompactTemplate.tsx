'use client';

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnonCookieBootstrap } from '@/components/features/profile/AnonCookieBootstrap';
import {
  ProfileNotificationsContext,
  useProfileShell,
} from '@/components/organisms/profile-shell';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import type {
  ProfileMode,
  ProfileSurfacePresentation,
} from '@/features/profile/contracts';
import type { DrawerView } from '@/features/profile/ProfileUnifiedDrawer';
import {
  getProfileMode,
  getProfileModeHref,
} from '@/features/profile/registry';
import type { PublicRelease } from '@/features/profile/releases/types';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import {
  buildProfileAccentCssVars,
  readProfileAccentTheme,
} from '@/lib/profile/profile-theme';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import {
  useUnsubscribeNotificationsMutation,
  useUpdateContentPreferencesMutation,
} from '@/lib/queries/useNotificationStatusQuery';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import { isDefaultAvatarUrl } from '@/lib/utils/dsp-images';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';
import { ProfileCompactSurface } from './ProfileCompactSurface';
import { PublicProfileLayoutShell } from './PublicProfileLayoutShell';

interface ProfileCompactTemplateProps {
  readonly mode: ProfileMode;
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
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly alertOptInVariant?: ProfileAlertOptInVariant;
  readonly genres?: string[] | null;
  readonly pressPhotos?: PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly tourDates?: TourDateViewModel[];
  readonly visitTrackingToken?: string;
  readonly showSubscriptionConfirmedBanner?: boolean;
  readonly viewerCountryCode?: string | null;
  readonly releases?: readonly PublicRelease[];
  readonly hideJovieBranding?: boolean;
  readonly hideMoreMenu?: boolean;
  readonly visualVariant?: 'default';
}

function resolveDrawerView(
  mode: ProfileMode,
  options: {
    readonly hasContacts: boolean;
    readonly hasTip: boolean;
    readonly hasReleases: boolean;
  },
  layout: 'compact' | 'desktop'
): DrawerView | null {
  if (layout === 'desktop') {
    switch (mode) {
      case 'contact':
        return options.hasContacts ? mode : null;
      case 'pay':
        return options.hasTip ? mode : null;
      default:
        return null;
    }
  }

  switch (mode) {
    case 'contact':
      return options.hasContacts ? mode : null;
    case 'pay':
      return options.hasTip ? mode : null;
    case 'about':
    case 'profile':
    case 'listen':
    case 'subscribe':
    case 'tour':
    case 'releases':
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

const DRAWER_CLOSE_RESET_DELAY_MS = 200;

function getInitialModeFromLocation(
  fallbackMode: ProfileMode,
  readWindowLocation = false
): ProfileMode {
  if (!readWindowLocation || globalThis.window === undefined) {
    return fallbackMode;
  }

  const modeParam = new URLSearchParams(globalThis.location.search).get('mode');
  return modeParam === null ? fallbackMode : getProfileMode(modeParam);
}

function getInitialDrawerPresentation(): ProfileSurfacePresentation {
  // Keep the first client render identical to the server render. The responsive
  // presentation is synced in an effect immediately after hydration.
  return 'standalone';
}

function getInitialIsDesktopLayout(): boolean {
  // Keep the first client render identical to the server render. The responsive
  // layout is synced in an effect immediately after hydration.
  return false;
}

function getModeFromUrl(): ProfileMode {
  if (globalThis.window === undefined) {
    return 'profile';
  }

  const modeParam = new URLSearchParams(globalThis.location.search).get('mode');
  return modeParam === null ? 'profile' : getProfileMode(modeParam);
}

function getModeFromDrawerView(view: DrawerView): ProfileMode | null {
  switch (view) {
    case 'about':
    case 'subscribe':
    case 'contact':
    case 'listen':
    case 'pay':
    case 'tour':
    case 'releases':
      return view;
    default:
      return null;
  }
}

function resolveHistoryMode(params: {
  readonly drawerOpen: boolean;
  readonly drawerView: DrawerView;
  readonly requestedMode: ProfileMode;
}): ProfileMode | null {
  const { drawerOpen, drawerView, requestedMode } = params;

  if (!drawerOpen || drawerView === 'menu' || drawerView === 'notifications') {
    return requestedMode === 'profile' ? null : requestedMode;
  }

  return getModeFromDrawerView(drawerView) ?? requestedMode;
}

export function ProfileCompactTemplate({
  mode,
  artist,
  socialLinks,
  contacts,
  showPayButton = false,
  latestRelease,
  profileSettings,
  featuredPlaylistFallback,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  alertOptInVariant = 'button',
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  photoDownloadSizes = [],
  tourDates = [],
  visitTrackingToken,
  showSubscriptionConfirmedBanner = false,
  viewerCountryCode,
  releases,
  hideJovieBranding = false,
  hideMoreMenu = false,
  visualVariant = 'default',
}: ProfileCompactTemplateProps) {
  // alertOptInVariant starts as the ISR-rendered default ('button').
  // AnonCookieBootstrap resolves the per-user Statsig variant on mount and
  // updates this state, so real visitors see their assigned experiment variant.
  const [resolvedAlertOptInVariant, setResolvedAlertOptInVariant] =
    useState<ProfileAlertOptInVariant>(alertOptInVariant);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<DrawerView>('menu');
  const [drawerPresentation, setDrawerPresentation] =
    useState<ProfileSurfacePresentation>(getInitialDrawerPresentation);
  const [isDesktopLayout, setIsDesktopLayout] = useState(
    getInitialIsDesktopLayout
  );
  const [requestedMode, setRequestedMode] = useState<ProfileMode>(() =>
    getInitialModeFromLocation(mode, false)
  );
  const revealNotificationsRef = useRef<(() => void) | null>(null);
  const closeResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerOpenRef = useRef(false);
  const lastPrimaryModeRef = useRef<ProfileMode>('profile');
  const initialLocationModeAlignedRef = useRef(false);
  const suppressNextHistorySyncRef = useRef(true);

  const clearCloseResetTimer = useCallback(() => {
    if (closeResetTimerRef.current !== null) {
      clearTimeout(closeResetTimerRef.current);
      closeResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  useEffect(() => clearCloseResetTimer, [clearCloseResetTimer]);

  useEffect(() => {
    const orientation = screen?.orientation as
      | (ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
          unlock?: () => void;
        })
      | undefined;
    if (!orientation?.lock) return;
    orientation.lock('portrait').catch(() => {});
    return () => {
      orientation.unlock?.();
    };
  }, []);

  useEffect(() => {
    if (globalThis.window === undefined) {
      return;
    }

    const embeddedQuery = globalThis.matchMedia('(min-width: 768px)');
    const desktopQuery = globalThis.matchMedia('(min-width: 1180px)');
    const syncPresentation = () => {
      setIsDesktopLayout(desktopQuery.matches);
      setDrawerPresentation(
        desktopQuery.matches
          ? 'modal'
          : embeddedQuery.matches
            ? 'embedded'
            : 'standalone'
      );
    };

    syncPresentation();

    if (
      typeof embeddedQuery.addEventListener === 'function' &&
      typeof desktopQuery.addEventListener === 'function'
    ) {
      embeddedQuery.addEventListener('change', syncPresentation);
      desktopQuery.addEventListener('change', syncPresentation);
      return () => {
        embeddedQuery.removeEventListener('change', syncPresentation);
        desktopQuery.removeEventListener('change', syncPresentation);
      };
    }

    embeddedQuery.addListener(syncPresentation);
    desktopQuery.addListener(syncPresentation);
    return () => {
      embeddedQuery.removeListener(syncPresentation);
      desktopQuery.removeListener(syncPresentation);
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
    const imageUrl = unwrapNextImageUrl(
      photoDownloadSizes.find(size => size.key === 'large')?.url ??
        photoDownloadSizes.find(size => size.key === 'original')?.url ??
        artist.image_url ??
        null
    );
    return isDefaultAvatarUrl(imageUrl) ? null : imageUrl;
  }, [artist.image_url, photoDownloadSizes]);

  // Track hero image load failure so the ambient background degrades to the
  // gradient placeholder instead of rendering a blank or icon-filled container.
  const [heroImageError, setHeroImageError] = useState(false);

  // Reset on hero URL change (e.g. artist data refresh or profile switch)
  useEffect(() => {
    setHeroImageError(false);
  }, [heroImageUrl]);

  const profileAccentStyle = useMemo(
    () =>
      buildProfileAccentCssVars(
        readProfileAccentTheme(artist.theme)
      ) as CSSProperties,
    [artist.theme]
  );

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

  const serverPrefs = notificationsController.contentPreferences;
  const [contentPrefs, setContentPrefs] = useState<
    Record<NotificationContentType, boolean>
  >({
    newMusic: serverPrefs?.newMusic ?? true,
    tourDates: serverPrefs?.tourDates ?? true,
    merch: serverPrefs?.merch ?? true,
    general: serverPrefs?.general ?? true,
  });

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

  const hasContacts = contacts.some(contact => contact.channels.length > 0);
  const hasTip = useMemo(
    () => showPayButton && socialLinks.some(link => link.platform === 'venmo'),
    [showPayButton, socialLinks]
  );
  const hasReleases = (releases?.length ?? 0) >= 2;
  const searchSuffix = useMemo(() => {
    if (!initialSource) {
      return '';
    }

    return `source=${encodeURIComponent(initialSource)}`;
  }, [initialSource]);

  const resolveInitialView = useCallback(
    (nextMode: ProfileMode) =>
      resolveDrawerView(
        nextMode,
        {
          hasContacts,
          hasTip,
          hasReleases,
        },
        isDesktopLayout ? 'desktop' : 'compact'
      ),
    [hasContacts, hasReleases, hasTip, isDesktopLayout]
  );

  const syncRequestedModeFromLocation = useCallback(() => {
    setRequestedMode(currentMode => {
      const nextMode = getInitialModeFromLocation(mode, true);
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
    if (requestedMode === getModeFromUrl()) {
      initialLocationModeAlignedRef.current = true;
    }
  }, [requestedMode]);

  useEffect(() => {
    if (
      requestedMode === 'profile' ||
      requestedMode === 'listen' ||
      requestedMode === 'tour' ||
      requestedMode === 'about' ||
      requestedMode === 'releases'
    ) {
      lastPrimaryModeRef.current = requestedMode;
    }
  }, [requestedMode]);

  useEffect(() => {
    const resolved = resolveInitialView(requestedMode);
    if (resolved) {
      clearCloseResetTimer();
      setDrawerView(resolved);
      drawerOpenRef.current = true;
      setDrawerOpen(true);
      return;
    }

    drawerOpenRef.current = false;
    setDrawerOpen(false);
  }, [clearCloseResetTimer, requestedMode, resolveInitialView]);

  useEffect(() => {
    const handlePopState = () => {
      syncRequestedModeFromLocation();
    };

    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [syncRequestedModeFromLocation]);

  useEffect(() => {
    if (!initialLocationModeAlignedRef.current) {
      return;
    }

    if (suppressNextHistorySyncRef.current) {
      suppressNextHistorySyncRef.current = false;
      return;
    }

    const activeMode = resolveHistoryMode({
      drawerOpen,
      drawerView,
      requestedMode,
    });
    const isHistoryModeSettled =
      requestedMode === 'profile'
        ? activeMode === null
        : activeMode === requestedMode;

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

  const profileHref = useMemo(
    () => getProfileModeHref(artist.handle, 'profile', searchSuffix),
    [artist.handle, searchSuffix]
  );

  const openDrawerMode = useCallback(
    (nextView: DrawerView) => {
      clearCloseResetTimer();
      const nextMode = getModeFromDrawerView(nextView);
      if (nextMode) {
        setRequestedMode(nextMode);
        return;
      }

      suppressNextHistorySyncRef.current = true;
      drawerOpenRef.current = true;
      setDrawerView(nextView);
      setDrawerOpen(true);
    },
    [clearCloseResetTimer]
  );

  const handleDrawerOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        clearCloseResetTimer();
        drawerOpenRef.current = false;
        setRequestedMode(
          isDesktopLayout ? lastPrimaryModeRef.current : 'profile'
        );
        setDrawerOpen(false);
        closeResetTimerRef.current = setTimeout(() => {
          closeResetTimerRef.current = null;
          if (!drawerOpenRef.current) {
            setDrawerView('menu');
          }
        }, DRAWER_CLOSE_RESET_DELAY_MS);
        return;
      }

      clearCloseResetTimer();
      drawerOpenRef.current = true;
      setDrawerOpen(true);
    },
    [clearCloseResetTimer, isDesktopLayout]
  );

  const handleDrawerViewChange = useCallback(
    (nextView: DrawerView) => {
      clearCloseResetTimer();
      const nextMode = getModeFromDrawerView(nextView);
      if (nextMode) {
        setRequestedMode(nextMode);
        return;
      }

      suppressNextHistorySyncRef.current = true;
      drawerOpenRef.current = true;
      setDrawerView(nextView);
      setDrawerOpen(true);
    },
    [clearCloseResetTimer]
  );

  const handlePlayClick = useCallback(() => {
    if (mergedDSPs.length === 0) {
      clearCloseResetTimer();
      setRequestedMode('subscribe');
      return;
    }
    clearCloseResetTimer();
    setRequestedMode('listen');
  }, [clearCloseResetTimer, mergedDSPs.length]);

  const handleBack = useCallback(() => {
    if (
      globalThis.window !== undefined &&
      globalThis.history.length > 1 &&
      document.referrer.length > 0
    ) {
      globalThis.history.back();
      return;
    }

    globalThis.location.assign(APP_ROUTES.ARTIST_PROFILES);
  }, []);

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

  const compactSurfaceShowsModeHeading = drawerOpen
    ? drawerView === 'listen' ||
      drawerView === 'releases' ||
      drawerView === 'subscribe' ||
      drawerView === 'notifications' ||
      drawerView === 'tour'
    : requestedMode === 'listen' ||
      requestedMode === 'releases' ||
      requestedMode === 'subscribe' ||
      requestedMode === 'tour';
  const shouldRenderTemplateHeading = isDesktopLayout
    ? true
    : compactSurfaceShowsModeHeading;

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      {/* Resolves the per-user jv_aid variant client-side after ISR hydration.
          Renders null; updates resolvedAlertOptInVariant state on mount. */}
      <AnonCookieBootstrap onVariantResolved={setResolvedAlertOptInVariant} />
      <PublicProfileLayoutShell
        artistName={artist.name}
        heroImageUrl={heroImageUrl}
        heroImageError={heroImageError}
        onHeroImageLoadError={() => setHeroImageError(true)}
        isDesktopLayout={isDesktopLayout}
        shouldRenderHeading={shouldRenderTemplateHeading}
        profileAccentStyle={profileAccentStyle}
        compactSurface={
          <div
            className='public-profile-compact-shell relative flex h-full min-w-0 w-full flex-col overflow-hidden bg-[color:var(--profile-content-bg)] md:mx-auto md:rounded-[var(--profile-shell-card-radius)] md:border md:border-[color:var(--profile-panel-border)] md:shadow-[var(--profile-panel-shadow)]'
            data-testid='profile-compact-shell'
          >
            <ProfileCompactSurface
              renderMode='interactive'
              presentation={drawerPresentation}
              artist={artist}
              socialLinks={socialLinks}
              contacts={contacts}
              showPayButton={showPayButton}
              latestRelease={latestRelease}
              profileSettings={profileSettings}
              featuredPlaylistFallback={featuredPlaylistFallback}
              enableDynamicEngagement={enableDynamicEngagement}
              subscribeTwoStep={subscribeTwoStep}
              alertOptInVariant={resolvedAlertOptInVariant}
              genres={genres}
              pressPhotos={pressPhotos}
              allowPhotoDownloads={allowPhotoDownloads}
              photoDownloadSizes={photoDownloadSizes}
              tourDates={tourDates}
              showSubscriptionConfirmedBanner={showSubscriptionConfirmedBanner}
              viewerCountryCode={viewerCountryCode}
              hideJovieBranding={hideJovieBranding}
              hideMoreMenu={hideMoreMenu}
              renderInteractiveOverlays
              renderSemanticHeading={!isDesktopLayout}
              drawerOpen={drawerOpen}
              drawerView={drawerView}
              activeMode={requestedMode}
              onModeSelect={nextMode => {
                clearCloseResetTimer();
                setRequestedMode(nextMode);
              }}
              onDrawerOpenChange={handleDrawerOpenChange}
              onDrawerViewChange={handleDrawerViewChange}
              onBack={handleBack}
              onOpenMenu={() => openDrawerMode('menu')}
              onPlayClick={handlePlayClick}
              onShare={handleShare}
              profileHref={profileHref}
              artistProfilesHref={APP_ROUTES.ARTIST_PROFILES}
              isSubscribed={isSubscribed}
              contentPrefs={contentPrefs}
              onTogglePref={handleTogglePref}
              onUnsubscribe={handleUnsubscribe}
              isUnsubscribing={unsubMutation.isPending}
              onManageNotifications={() => {
                clearCloseResetTimer();
                setRequestedMode('subscribe');
              }}
              onRegisterReveal={fn => {
                revealNotificationsRef.current = fn;
              }}
              onRevealNotifications={() => {
                revealNotificationsRef.current?.();
              }}
              releases={releases}
            />
          </div>
        }
      />
    </ProfileNotificationsContext.Provider>
  );
}
