import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import {
  getNotificationStatus,
  getNotificationUnsubscribeSuccessMessage,
  NOTIFICATION_COPY,
  unsubscribeFromNotifications,
} from '@/lib/notifications/client';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';

export type ProfileNotificationsState = 'idle' | 'editing' | 'success';

export type ProfileNotificationsHydrationStatus = 'idle' | 'checking' | 'done';

type ControllerParams = {
  artistId: string;
  artistHandle: string;
  notificationsEnabled: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const STORAGE_KEY = 'jovie:notification-contacts';
const STATUS_CACHE_KEY = 'jovie:notification-status-cache';
// Cache notification status for 5 minutes to reduce API calls on hydration
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

interface StatusCache {
  artistId: string;
  channels: NotificationSubscriptionState;
  details: NotificationContactValues;
  timestamp: number;
}

function readStoredContacts(): NotificationContactValues | null {
  if (typeof window === 'undefined') return null;
  try {
    const storedRaw = window.localStorage.getItem(STORAGE_KEY);
    if (!storedRaw) return null;
    const parsed = JSON.parse(storedRaw) as NotificationContactValues;
    const hasStoredContact = Boolean(parsed.email || parsed.sms);
    return hasStoredContact ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read cached notification status if valid (not expired and same artist).
 * This avoids making an API call on every page load for returning visitors.
 */
function readCachedStatus(artistId: string): StatusCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = window.localStorage.getItem(STATUS_CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as StatusCache;

    // Check if cache is for the same artist and not expired
    const isValid =
      parsed.artistId === artistId &&
      Date.now() - parsed.timestamp < STATUS_CACHE_TTL_MS;

    return isValid ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Cache notification status to avoid repeated API calls.
 */
function writeCachedStatus(
  artistId: string,
  channels: NotificationSubscriptionState,
  details: NotificationContactValues
): void {
  if (typeof window === 'undefined') return;
  try {
    const cache: StatusCache = {
      artistId,
      channels,
      details,
      timestamp: Date.now(),
    };
    window.localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
}

export function formatE164PhoneForDisplay(value: string): string {
  const digits = value.replaceAll(/\D/g, '');
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
  const storedContacts = readStoredContacts();
  const hasInitialStoredContacts = Boolean(storedContacts);

  const [state, setState] = useState<ProfileNotificationsState>('idle');
  const [hydrationStatus, setHydrationStatus] =
    useState<ProfileNotificationsHydrationStatus>(() => {
      if (!notificationsEnabled) return 'idle';
      return hasInitialStoredContacts ? 'checking' : 'done';
    });
  // Default channel based on stored contacts: if user has email but not sms, default to email
  const [channel, setChannel] = useState<NotificationChannel>(() => {
    if (storedContacts?.email && !storedContacts?.sms) return 'email';
    return 'sms';
  });
  const [subscribedChannels, setSubscribedChannels] =
    useState<NotificationSubscriptionState>({});
  const [subscriptionDetails, setSubscriptionDetails] =
    useState<NotificationContactValues>(() => storedContacts ?? {});
  const [hasStoredContacts, setHasStoredContacts] = useState<boolean>(
    hasInitialStoredContacts
  );
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [channelBusy, setChannelBusy] = useState<
    Partial<Record<NotificationChannel, boolean>>
  >({});

  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasMenuOpenRef = useRef(false);
  const inputFocusFnRef = useRef<(() => void) | null>(null);

  const registerInputFocus = useCallback((focusFn: (() => void) | null) => {
    inputFocusFnRef.current = focusFn;
  }, []);

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
    if (!storedRaw) {
      setHasStoredContacts(false);
      setHydrationStatus('done');
      return;
    }

    try {
      const parsed = JSON.parse(storedRaw) as NotificationContactValues;
      const hasStoredContact = Boolean(parsed.email || parsed.sms);
      setHasStoredContacts(hasStoredContact);

      if (!hasStoredContact) {
        setHydrationStatus('done');
        return;
      }

      setSubscriptionDetails(prev => ({ ...prev, ...parsed }));

      // Check if we have a valid cached status (avoids API call on every page load)
      const cachedStatus = readCachedStatus(artistId);
      if (cachedStatus) {
        setSubscribedChannels(cachedStatus.channels);
        const hasAny = Object.values(cachedStatus.channels).some(Boolean);
        if (hasAny) {
          setSubscriptionDetails(cachedStatus.details);
          setState('success');
        }
        setHydrationStatus('done');
        return;
      }

      // No cache - fetch from API
      setHydrationStatus('checking');

      void (async () => {
        try {
          const data = await getNotificationStatus({
            artistId,
            email: parsed.email,
            phone: parsed.sms,
          });

          setSubscribedChannels(data.channels);
          const hasAny = Object.values(data.channels).some(Boolean);

          if (hasAny) {
            setSubscriptionDetails(data.details ?? {});
            setState('success');
          }

          // Cache the result to avoid future API calls
          writeCachedStatus(artistId, data.channels, data.details ?? {});
        } catch (error) {
          console.error(
            'Unable to hydrate notification subscription state',
            error
          );
        } finally {
          setHydrationStatus('done');
        }
      })();
    } catch {
      // Ignore parse failures
      setHasStoredContacts(false);
      setHydrationStatus('done');
    }
  }, [artistId, notificationsEnabled]);

  const handleNotificationsClick = useCallback(() => {
    if (!notificationsEnabled) return;

    if (hasActiveSubscriptions) {
      setIsNotificationMenuOpen(true);
      return;
    }

    // If already in editing state, just focus the input
    if (state === 'editing') {
      inputFocusFnRef.current?.();
      return;
    }

    openSubscription(channel);
  }, [
    channel,
    hasActiveSubscriptions,
    notificationsEnabled,
    openSubscription,
    state,
  ]);

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
        onError(NOTIFICATION_COPY.errors.missingContact);
        return;
      }

      // Store previous state for rollback on error
      const previousChannels = { ...subscribedChannels };
      const previousDetails = { ...subscriptionDetails };
      const previousState = state;

      // Optimistic update: immediately update UI
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
      setChannelBusy(prev => ({ ...prev, [targetChannel]: true }));

      try {
        track('notifications_unsubscribe_attempt', {
          channel: targetChannel,
          handle: artistHandle,
          source: 'profile_inline',
        });

        await unsubscribeFromNotifications({
          artistId,
          channel: targetChannel,
          email: targetChannel === 'email' ? contactValue : undefined,
          phone: targetChannel === 'sms' ? contactValue : undefined,
          method: 'dropdown',
        });

        track('notifications_unsubscribe_success', {
          channel: targetChannel,
          handle: artistHandle,
          source: 'profile_inline',
        });

        onSuccess(getNotificationUnsubscribeSuccessMessage(targetChannel));
      } catch (error) {
        // Rollback optimistic update on error
        setSubscribedChannels(previousChannels);
        setSubscriptionDetails(previousDetails);
        setState(previousState);

        const message =
          error instanceof Error
            ? error.message
            : NOTIFICATION_COPY.errors.unsubscribe;

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
      state,
      subscribedChannels,
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
    hasStoredContacts,
    hasActiveSubscriptions,
    hydrationStatus,
    isNotificationMenuOpen,
    isSubscribed,
    menuTriggerRef,
    notificationsEnabled,
    openSubscription,
    registerInputFocus,
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
