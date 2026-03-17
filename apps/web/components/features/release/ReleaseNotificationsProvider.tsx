'use client';

/**
 * ReleaseNotificationsProvider
 *
 * A minimal provider that sets up the ProfileNotificationsContext
 * for use in release pages. This allows the ArtistNotificationsCTA
 * component to work standalone without the full ProfileShell.
 */

import { type ReactNode, useMemo } from 'react';
import { useProfileNotificationsController } from '@/components/organisms/hooks/useProfileNotificationsController';
import { ProfileNotificationsContext } from '@/components/organisms/profile-shell';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { Artist } from '@/types/db';

interface ReleaseNotificationsProviderProps {
  readonly artist: Artist;
  readonly children: ReactNode;
}

export function ReleaseNotificationsProvider({
  artist,
  children,
}: ReleaseNotificationsProviderProps) {
  const { success: showSuccess, error: showError } = useNotifications();

  const notificationsController = useProfileNotificationsController({
    artistHandle: artist.handle,
    artistId: artist.id,
    notificationsEnabled: true,
    onError: showError,
    onSuccess: showSuccess,
  });

  const {
    channel,
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

  const notificationsContextValue = useMemo(
    () => ({
      state: notificationsState,
      setState: setNotificationsState,
      hydrationStatus,
      hasStoredContacts,
      notificationsEnabled: true,
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

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      {children}
    </ProfileNotificationsContext.Provider>
  );
}
