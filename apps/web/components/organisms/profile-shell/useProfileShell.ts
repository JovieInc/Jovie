'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useProfileNotificationsController } from '@/components/organisms/hooks/useProfileNotificationsController';
import {
  usePopstateReset,
  useProfileVisitTracking,
  useTipPageTracking,
} from '@/components/organisms/hooks/useProfileTracking';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { LegacySocialLink } from '@/types/db';
import type {
  ProfileNotificationsContextValue,
  ProfileShellProps,
} from './types';
import { SOCIAL_NETWORK_PLATFORMS } from './types';

export interface UseProfileShellReturn {
  isTipNavigating: boolean;
  setIsTipNavigating: (value: boolean) => void;
  notificationsEnabled: boolean;
  notificationsController: ReturnType<typeof useProfileNotificationsController>;
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
    hasStoredContacts,
    hydrationStatus,
    openSubscription,
    setChannel,
    setState: setNotificationsState,
    setSubscribedChannels,
    setSubscriptionDetails,
    state: notificationsState,
    subscribedChannels,
    subscriptionDetails,
  } = notificationsController;

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
    }),
    [
      channel,
      hasStoredContacts,
      hydrationStatus,
      notificationsState,
      openSubscription,
      setChannel,
      setNotificationsState,
      setSubscribedChannels,
      setSubscriptionDetails,
      subscribedChannels,
      subscriptionDetails,
    ]
  );

  const socialNetworkLinks = socialLinks.filter(
    link =>
      link.is_visible !== false &&
      SOCIAL_NETWORK_PLATFORMS.includes(
        link.platform.toLowerCase() as (typeof SOCIAL_NETWORK_PLATFORMS)[number]
      )
  );
  const hasSocialLinks = socialNetworkLinks.length > 0;
  const hasContacts = contacts.length > 0;

  return {
    isTipNavigating,
    setIsTipNavigating,
    notificationsEnabled,
    notificationsController,
    notificationsContextValue,
    socialNetworkLinks,
    hasSocialLinks,
    hasContacts,
  };
}
