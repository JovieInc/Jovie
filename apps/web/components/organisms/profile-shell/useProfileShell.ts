'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useProfileNotificationsController } from '@/components/organisms/hooks/useProfileNotificationsController';
import {
  usePopstateReset,
  useProfileVisitTracking,
  useTipPageTracking,
} from '@/components/organisms/hooks/useProfileTracking';
import {
  PROFILE_MODE_KEYS,
  type ProfileMode,
} from '@/features/profile/contracts';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { applyPublicProfileLinkCaps } from '@/lib/profile/social-link-limits';
import { sortSocialLinksByGeoPopularity } from '@/lib/utils/context-aware-links';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';
import type { LegacySocialLink } from '@/types/db';
import type {
  ProfileNotificationsContextValue,
  ProfileShellProps,
} from './types';
import { SOCIAL_NETWORK_PLATFORMS } from './types';

function isSafePublicSocialLink(link: LegacySocialLink): boolean {
  const rawPlatform = link.platform?.toLowerCase();
  const rawUrl = link.url?.trim();

  if (!rawPlatform || !rawUrl) {
    return false;
  }

  if (
    !SOCIAL_NETWORK_PLATFORMS.includes(
      rawPlatform as (typeof SOCIAL_NETWORK_PLATFORMS)[number]
    )
  ) {
    return false;
  }

  const urlValidation = validateSocialLinkUrl(rawUrl);
  if (!urlValidation.valid) {
    return false;
  }

  const detected = detectPlatform(rawUrl).platform.id;
  if (detected === rawPlatform) {
    return true;
  }

  return rawPlatform === 'youtube' && detected === 'youtube_music';
}

export interface UseProfileShellReturn {
  isTipNavigating: boolean;
  setIsTipNavigating: (value: boolean) => void;
  notificationsEnabled: boolean;
  notificationsController: ReturnType<typeof useProfileNotificationsController>;
  handleNotificationsTrigger: () => void;
  notificationsContextValue: ProfileNotificationsContextValue;
  socialNetworkLinks: LegacySocialLink[];
  modeLinks: LegacySocialLink[];
  socialLinks: LegacySocialLink[];
  hasSocialLinks: boolean;
  hasContacts: boolean;
}

const LOCATION_SEARCH_CHANGE_EVENT = 'jovie:location-search-change';
const HISTORY_PATCHED = Symbol('jovie.location-search-patched');

type PatchedHistoryMethod = History['pushState'] & {
  [HISTORY_PATCHED]?: true;
};

function patchHistoryEvents() {
  if (globalThis.history === undefined) {
    return;
  }

  const { pushState, replaceState } = globalThis.history;
  const patchedPushState = pushState as PatchedHistoryMethod;
  const patchedReplaceState = replaceState as PatchedHistoryMethod;

  if (
    patchedPushState[HISTORY_PATCHED] &&
    patchedReplaceState[HISTORY_PATCHED]
  ) {
    return;
  }

  const dispatchChange = () => {
    globalThis.dispatchEvent(new Event(LOCATION_SEARCH_CHANGE_EVENT));
  };

  const nextPushState: PatchedHistoryMethod = function patchedPushState(
    this: History,
    ...args: Parameters<History['pushState']>
  ) {
    pushState.apply(this, args);
    dispatchChange();
  };

  const nextReplaceState: PatchedHistoryMethod = function patchedReplaceState(
    this: History,
    ...args: Parameters<History['replaceState']>
  ) {
    replaceState.apply(this, args);
    dispatchChange();
  };

  nextPushState[HISTORY_PATCHED] = true;
  nextReplaceState[HISTORY_PATCHED] = true;
  globalThis.history.pushState = nextPushState;
  globalThis.history.replaceState = nextReplaceState;
}

function subscribeToLocationSearch(onStoreChange: () => void): () => void {
  if (globalThis.location === undefined) {
    return () => undefined;
  }

  patchHistoryEvents();
  globalThis.addEventListener('popstate', onStoreChange);
  globalThis.addEventListener(LOCATION_SEARCH_CHANGE_EVENT, onStoreChange);

  return () => {
    globalThis.removeEventListener('popstate', onStoreChange);
    globalThis.removeEventListener(LOCATION_SEARCH_CHANGE_EVENT, onStoreChange);
  };
}

function getLocationSearchSnapshot(): string {
  if (globalThis.location === undefined) {
    return '';
  }

  return globalThis.location.search;
}

function resolveModeFromSearch(
  search: string,
  fallbackMode: ProfileMode
): ProfileMode {
  if (!search) {
    return fallbackMode;
  }

  const modeParam = new URLSearchParams(search).get('mode');
  if (
    modeParam &&
    PROFILE_MODE_KEYS.includes(modeParam as (typeof PROFILE_MODE_KEYS)[number])
  ) {
    return modeParam as ProfileMode;
  }

  return fallbackMode;
}

function resolveSourceFromSearch(
  search: string,
  fallbackSource: string | null
): string | null {
  if (!search) {
    return fallbackSource;
  }

  return new URLSearchParams(search).get('source') ?? fallbackSource;
}

export function useProfileShell({
  artist,
  socialLinks,
  viewerCountryCode,
  contacts = [],
  visitTrackingToken,
  modeOverride,
  sourceOverride,
  smsEnabled = false,
}: Pick<
  ProfileShellProps,
  | 'artist'
  | 'socialLinks'
  | 'viewerCountryCode'
  | 'contacts'
  | 'visitTrackingToken'
> & {
  modeOverride?: ProfileMode;
  sourceOverride?: string | null;
  smsEnabled?: boolean;
}): UseProfileShellReturn {
  const [isTipNavigating, setIsTipNavigating] = useState(false);
  const { success: showSuccess, error: showError } = useNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const locationSearch = useSyncExternalStore(
    subscribeToLocationSearch,
    getLocationSearchSnapshot,
    () => ''
  );
  const locationMode = useMemo(
    () => resolveModeFromSearch(locationSearch, 'profile'),
    [locationSearch]
  );
  const locationSource = useMemo(
    () => resolveSourceFromSearch(locationSearch, null),
    [locationSearch]
  );

  const mode = modeOverride ?? locationMode;
  const source = sourceOverride ?? locationSource;

  // Notifications CTA is always enabled (previously gated by preview=1 param)
  const notificationsEnabled = true;

  useTipPageTracking({
    artistHandle: artist.handle,
    mode,
    source,
  });
  useProfileVisitTracking(artist.id, visitTrackingToken);
  usePopstateReset(() => setIsTipNavigating(false));

  // Reset tip loading on navigation/back
  useEffect(() => {
    setIsTipNavigating(false);
  }, [pathname, mode]);

  const notificationsController = useProfileNotificationsController({
    artistHandle: artist.handle,
    artistId: artist.id,
    notificationsEnabled,
    smsEnabled,
    onError: showError,
    onSuccess: showSuccess,
  });

  const {
    channel,
    handleNotificationsClick,
    hasStoredContacts,
    hydrationStatus,
    openSubscription,
    registerInputFocus,
    setChannel,
    setState: setNotificationsState,
    setSubscribedChannels,
    setSubscriptionDetails,
    state: notificationsState,
    subscribedChannels,
    subscriptionDetails,
  } = notificationsController;

  const handleNotificationsTrigger = useMemo(
    () => () => {
      const isPrimaryProfileMode = mode === 'profile';

      if (
        !isPrimaryProfileMode &&
        !notificationsController.hasActiveSubscriptions
      ) {
        const sourceParam = source
          ? `&source=${encodeURIComponent(source)}`
          : '';
        router.push(`/${artist.handle}?mode=subscribe${sourceParam}`);
        return;
      }

      handleNotificationsClick();
    },
    [
      artist.handle,
      handleNotificationsClick,
      mode,
      notificationsController.hasActiveSubscriptions,
      router,
      source,
    ]
  );

  const notificationsContextValue = useMemo(
    () => ({
      state: notificationsState,
      setState: setNotificationsState,
      hydrationStatus,
      hasStoredContacts,
      notificationsEnabled,
      channel,
      setChannel,
      subscribedChannels,
      setSubscribedChannels,
      subscriptionDetails,
      setSubscriptionDetails,
      contentPreferences: notificationsController.contentPreferences,
      artistEmail: notificationsController.artistEmail,
      openSubscription,
      registerInputFocus,
      smsEnabled,
    }),
    [
      channel,
      hasStoredContacts,
      hydrationStatus,
      notificationsEnabled,
      notificationsState,
      openSubscription,
      registerInputFocus,
      setChannel,
      setNotificationsState,
      setSubscribedChannels,
      setSubscriptionDetails,
      smsEnabled,
      subscribedChannels,
      subscriptionDetails,
      notificationsController.artistEmail,
      notificationsController.contentPreferences,
    ]
  );

  const socialNetworkLinks = useMemo(() => {
    const visibleLinks = socialLinks.filter(
      link => link.is_visible !== false && isSafePublicSocialLink(link)
    );
    return sortSocialLinksByGeoPopularity(visibleLinks, viewerCountryCode);
  }, [socialLinks, viewerCountryCode]);
  const cappedLinks = useMemo(
    () => applyPublicProfileLinkCaps(socialNetworkLinks),
    [socialNetworkLinks]
  );
  const hasSocialLinks =
    cappedLinks.modeLinks.length > 0 || cappedLinks.socialLinks.length > 0;
  const hasContacts = contacts.length > 0;

  return {
    isTipNavigating,
    setIsTipNavigating,
    notificationsEnabled,
    notificationsController,
    handleNotificationsTrigger,
    notificationsContextValue,
    socialNetworkLinks,
    modeLinks: cappedLinks.modeLinks,
    socialLinks: cappedLinks.socialLinks,
    hasSocialLinks,
    hasContacts,
  };
}
