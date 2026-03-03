'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useProfileNotificationsController } from '@/components/organisms/hooks/useProfileNotificationsController';
import {
  usePopstateReset,
  useProfileVisitTracking,
  useTipPageTracking,
} from '@/components/organisms/hooks/useProfileTracking';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  detectSourcePlatform,
  getContextAwareLinks,
} from '@/lib/utils/context-aware-links';
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
  hasSocialLinks: boolean;
  hasContacts: boolean;
}

export function useProfileShell({
  artist,
  socialLinks,
  contacts = [],
}: Pick<
  ProfileShellProps,
  'artist' | 'socialLinks' | 'contacts'
>): UseProfileShellReturn {
  const [isTipNavigating, setIsTipNavigating] = useState(false);
  const { success: showSuccess, error: showError } = useNotifications();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Memoize extracted search params to avoid downstream re-renders
  // when unrelated URL parameters change
  const { mode, source } = useMemo(
    () => ({
      mode: searchParams?.get('mode') ?? 'profile',
      source: searchParams?.get('source') ?? null,
    }),
    [searchParams]
  );

  // Notifications CTA is always enabled (previously gated by preview=1 param)
  const notificationsEnabled = true;

  useTipPageTracking({
    artistHandle: artist.handle,
    mode,
    source,
  });
  useProfileVisitTracking(artist.id);
  usePopstateReset(() => setIsTipNavigating(false));

  // Reset tip loading on navigation/back
  useEffect(() => {
    setIsTipNavigating(false);
  }, [pathname, mode]);

  const notificationsController = useProfileNotificationsController({
    artistHandle: artist.handle,
    artistId: artist.id,
    notificationsEnabled,
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
      openSubscription,
      registerInputFocus,
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
      subscribedChannels,
      subscriptionDetails,
    ]
  );

  const socialNetworkLinks = useMemo(() => {
    const visibleLinks = socialLinks.filter(
      link => link.is_visible !== false && isSafePublicSocialLink(link)
    );

    // Detect source platform from referrer or UTM params
    const referrer = typeof document === 'undefined' ? '' : document.referrer;
    const params = searchParams
      ? new URLSearchParams(searchParams.toString())
      : new URLSearchParams();
    const sourcePlatform = detectSourcePlatform(referrer, params);

    return getContextAwareLinks(visibleLinks, sourcePlatform);
  }, [socialLinks, searchParams]);
  const hasSocialLinks = socialNetworkLinks.length > 0;
  const hasContacts = contacts.length > 0;

  return {
    isTipNavigating,
    setIsTipNavigating,
    notificationsEnabled,
    notificationsController,
    handleNotificationsTrigger,
    notificationsContextValue,
    socialNetworkLinks,
    hasSocialLinks,
    hasContacts,
  };
}
