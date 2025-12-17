import { useCallback, useEffect, useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';
import type { ProfileNotificationsContextValue } from './profile-notifications.types';

interface ProfileNotificationsControllerOptions {
  artistId?: string;
  artistHandle?: string;
  notificationsEnabled: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const STORAGE_KEY = 'jovie:notification-contacts';

export function useProfileNotificationsController({
  artistHandle,
  artistId,
  notificationsEnabled,
  onError,
  onSuccess,
}: ProfileNotificationsControllerOptions) {
  const [state, setState] =
    useState<ProfileNotificationsContextValue['state']>('idle');
  const [channel, setChannel] = useState<NotificationChannel>('phone');
  const [subscribedChannels, setSubscribedChannels] =
    useState<NotificationSubscriptionState>({});
  const [subscriptionDetails, setSubscriptionDetails] =
    useState<NotificationContactValues>({});
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [channelBusy, setChannelBusy] = useState<
    Partial<Record<NotificationChannel, boolean>>
  >({});

  const hasActiveSubscriptions = useMemo(
    () => Boolean(subscribedChannels.email || subscribedChannels.phone),
    [subscribedChannels.email, subscribedChannels.phone]
  );

  const isSubscribed = state === 'success' && hasActiveSubscriptions;

  const openSubscription = useCallback(
    (nextChannel?: NotificationChannel) => {
      if (nextChannel) {
        setChannel(nextChannel);
      }

      setState('editing');
      setIsNotificationMenuOpen(false);

      if (!artistHandle) return;

      track('notifications_inline_cta_open', {
        handle: artistHandle,
        source: 'profile_inline',
        channel: nextChannel ?? channel,
      });
    },
    [artistHandle, channel]
  );

  const persistContacts = useCallback((next: NotificationContactValues) => {
    if (typeof window === 'undefined') return;

    try {
      const hasAny = Boolean(next.email || next.phone);

      if (!hasAny) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error('Failed to persist notification contacts', error);
    }
  }, []);

  useEffect(() => {
    persistContacts(subscriptionDetails);
  }, [persistContacts, subscriptionDetails]);

  useEffect(() => {
    if (!notificationsEnabled) return;
    if (typeof window === 'undefined') return;

    const storedRaw = window.localStorage.getItem(STORAGE_KEY);
    if (!storedRaw) return;

    let isMounted = true;

    void (async () => {
      try {
        const parsed = JSON.parse(storedRaw) as NotificationContactValues;
        const hasStoredContact = Boolean(parsed.email || parsed.phone);
        if (!hasStoredContact) return;

        const response = await fetch('/api/notifications/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artist_id: artistId,
            email: parsed.email,
            phone: parsed.phone,
          }),
        });

        if (!response.ok || !isMounted) return;

        const data = (await response.json()) as {
          channels?: NotificationSubscriptionState;
          details?: NotificationContactValues;
        };

        if (data.channels) {
          setSubscribedChannels(data.channels);
          const hasAny = Object.values(data.channels).some(Boolean);

          if (hasAny) {
            setSubscriptionDetails(data.details ?? {});
            setState('success');
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(
            'Unable to hydrate notification subscription state',
            error
          );
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [artistId, notificationsEnabled]);

  const handleNotificationsClick = useCallback(() => {
    if (!notificationsEnabled) return;

    if (hasActiveSubscriptions) {
      setIsNotificationMenuOpen(true);
      return;
    }

    openSubscription(channel);
  }, [channel, hasActiveSubscriptions, notificationsEnabled, openSubscription]);

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setIsNotificationMenuOpen(open);

      if (open && artistHandle) {
        const activeChannels = Object.entries(subscribedChannels)
          .filter(([, value]) => Boolean(value))
          .map(([key]) => key)
          .join(',');

        track('notifications_menu_open', {
          handle: artistHandle,
          active_channels: activeChannels,
        });
      }
    },
    [artistHandle, subscribedChannels]
  );

  const handleUnsubscribe = useCallback(
    async (targetChannel: NotificationChannel) => {
      if (channelBusy[targetChannel]) return;

      const contactValue = subscriptionDetails[targetChannel];

      if (!contactValue) {
        onError('Need your contact to unsubscribe. Add it again to manage.');
        return;
      }

      setChannelBusy(prev => ({ ...prev, [targetChannel]: true }));

      try {
        if (artistHandle) {
          track('notifications_unsubscribe_attempt', {
            channel: targetChannel,
            handle: artistHandle,
            source: 'profile_inline',
          });
        }

        const response = await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            artist_id: artistId,
            channel: targetChannel,
            email: targetChannel === 'email' ? contactValue : undefined,
            phone: targetChannel === 'phone' ? contactValue : undefined,
            method: 'dropdown',
          }),
        });

        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || 'Failed to unsubscribe');
        }

        if (artistHandle) {
          track('notifications_unsubscribe_success', {
            channel: targetChannel,
            handle: artistHandle,
            source: 'profile_inline',
          });
        }

        setSubscribedChannels(prev => {
          const next = { ...prev, [targetChannel]: false };
          const stillSubscribed = Object.values(next).some(Boolean);

          if (!stillSubscribed) {
            setState('editing');
          }

          return next;
        });

        setSubscriptionDetails(prev => {
          const next = { ...prev };
          delete next[targetChannel];
          return next;
        });

        setIsNotificationMenuOpen(false);

        onSuccess(
          targetChannel === 'phone'
            ? 'Unsubscribed from SMS updates.'
            : 'Unsubscribed from email updates.'
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to unsubscribe.';

        onError(message);

        if (artistHandle) {
          track('notifications_unsubscribe_error', {
            channel: targetChannel,
            handle: artistHandle,
            error_message: message,
            source: 'profile_inline',
          });
        }
      } finally {
        setChannelBusy(prev => ({ ...prev, [targetChannel]: false }));
      }
    },
    [
      artistHandle,
      artistId,
      channelBusy,
      onError,
      onSuccess,
      subscriptionDetails,
    ]
  );

  const contextValue: ProfileNotificationsContextValue = useMemo(
    () => ({
      state,
      setState,
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
      notificationsEnabled,
      openSubscription,
      state,
      subscribedChannels,
      subscriptionDetails,
    ]
  );

  return {
    channelBusy,
    contextValue,
    handleMenuOpenChange,
    handleNotificationsClick,
    handleUnsubscribe,
    hasActiveSubscriptions,
    isNotificationMenuOpen,
    isSubscribed,
    subscribedChannels,
    subscriptionDetails,
  } as const;
}
