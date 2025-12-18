import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';

export type ProfileNotificationsState = 'idle' | 'editing' | 'success';

type ControllerParams = {
  artistId: string;
  artistHandle: string;
  notificationsEnabled: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const STORAGE_KEY = 'jovie:notification-contacts';

export function formatE164PhoneForDisplay(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return value;

  if (digits.startsWith('1') && digits.length === 11) {
    const national = digits.slice(1);
    const part1 = national.slice(0, 3);
    const part2 = national.slice(3, 6);
    const part3 = national.slice(6, 10);
    return `+1 (${part1}) ${part2}-${part3}`;
  }

  if (value.startsWith('+')) {
    const grouped = digits.match(/.{1,3}/g);
    return grouped ? `+${grouped.join(' ')}` : value;
  }

  return value;
}

export function useProfileNotificationsController({
  artistHandle,
  artistId,
  notificationsEnabled,
  onError,
  onSuccess,
}: ControllerParams) {
  const [state, setState] = useState<ProfileNotificationsState>('idle');
  const [channel, setChannel] = useState<NotificationChannel>('sms');
  const [subscribedChannels, setSubscribedChannels] =
    useState<NotificationSubscriptionState>({});
  const [subscriptionDetails, setSubscriptionDetails] =
    useState<NotificationContactValues>({});
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [channelBusy, setChannelBusy] = useState<
    Partial<Record<NotificationChannel, boolean>>
  >({});

  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasMenuOpenRef = useRef(false);

  const hasActiveSubscriptions = useMemo(
    () => Boolean(subscribedChannels.email || subscribedChannels.sms),
    [subscribedChannels.email, subscribedChannels.sms]
  );

  const isSubscribed = state === 'success' && hasActiveSubscriptions;

  const openSubscription = useCallback(
    (nextChannel?: NotificationChannel) => {
      if (nextChannel) {
        setChannel(nextChannel);
      }

      setState('editing');
      setIsNotificationMenuOpen(false);

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
      const hasAny = Boolean(next.email || next.sms);

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

    try {
      const parsed = JSON.parse(storedRaw) as NotificationContactValues;
      const hasStoredContact = Boolean(parsed.email || parsed.sms);
      if (!hasStoredContact) return;

      void (async () => {
        try {
          const response = await fetch('/api/notifications/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artist_id: artistId,
              email: parsed.email,
              phone: parsed.sms,
            }),
          });

          if (!response.ok) return;

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
          console.error(
            'Unable to hydrate notification subscription state',
            error
          );
        }
      })();
    } catch {
      // Ignore parse failures
    }
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

      if (open) {
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
        track('notifications_unsubscribe_attempt', {
          channel: targetChannel,
          handle: artistHandle,
          source: 'profile_inline',
        });

        const response = await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            artist_id: artistId,
            channel: targetChannel,
            email: targetChannel === 'email' ? contactValue : undefined,
            phone: targetChannel === 'sms' ? contactValue : undefined,
            method: 'dropdown',
          }),
        });

        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || 'Failed to unsubscribe');
        }

        track('notifications_unsubscribe_success', {
          channel: targetChannel,
          handle: artistHandle,
          source: 'profile_inline',
        });

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
          targetChannel === 'sms'
            ? 'Unsubscribed from SMS updates.'
            : 'Unsubscribed from email updates.'
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to unsubscribe.';

        onError(message);

        track('notifications_unsubscribe_error', {
          channel: targetChannel,
          handle: artistHandle,
          error_message: message,
          source: 'profile_inline',
        });
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

  useEffect(() => {
    if (wasMenuOpenRef.current && !isNotificationMenuOpen) {
      menuTriggerRef.current?.focus();
    }
    wasMenuOpenRef.current = isNotificationMenuOpen;
  }, [isNotificationMenuOpen]);

  return {
    channel,
    channelBusy,
    handleMenuOpenChange,
    handleNotificationsClick,
    handleUnsubscribe,
    hasActiveSubscriptions,
    isNotificationMenuOpen,
    isSubscribed,
    menuTriggerRef,
    notificationsEnabled,
    openSubscription,
    setChannel,
    setState,
    setSubscribedChannels,
    setSubscriptionDetails,
    state,
    subscribedChannels,
    subscriptionDetails,
  };
}

export type ProfileNotificationsController = ReturnType<
  typeof useProfileNotificationsController
>;
