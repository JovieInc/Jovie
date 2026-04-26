'use client';

import React from 'react';
import type { ProfileNotificationsContextValue } from './types';

export const ProfileNotificationsContext =
  React.createContext<ProfileNotificationsContextValue | null>(null);

const noop = () => {};

const FALLBACK_PROFILE_NOTIFICATIONS_CONTEXT: ProfileNotificationsContextValue =
  {
    state: 'idle',
    setState: noop,
    hydrationStatus: 'done',
    hasStoredContacts: false,
    notificationsEnabled: false,
    channel: 'email',
    setChannel: noop,
    subscribedChannels: {},
    setSubscribedChannels: noop,
    subscriptionDetails: {},
    setSubscriptionDetails: noop,
    contentPreferences: undefined,
    artistEmail: undefined,
    openSubscription: noop,
    registerInputFocus: noop,
    smsEnabled: false,
  };

export function useProfileNotifications(): ProfileNotificationsContextValue {
  const value = React.useContext(ProfileNotificationsContext);

  return value ?? FALLBACK_PROFILE_NOTIFICATIONS_CONTEXT;
}
