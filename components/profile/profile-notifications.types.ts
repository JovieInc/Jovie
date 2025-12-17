import React from 'react';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';

export type ProfileNotificationsState = 'idle' | 'editing' | 'success';

export interface ProfileNotificationsContextValue {
  state: ProfileNotificationsState;
  setState: React.Dispatch<React.SetStateAction<ProfileNotificationsState>>;
  notificationsEnabled: boolean;
  channel: NotificationChannel;
  setChannel: React.Dispatch<React.SetStateAction<NotificationChannel>>;
  subscribedChannels: NotificationSubscriptionState;
  setSubscribedChannels: React.Dispatch<
    React.SetStateAction<NotificationSubscriptionState>
  >;
  subscriptionDetails: NotificationContactValues;
  setSubscriptionDetails: React.Dispatch<
    React.SetStateAction<NotificationContactValues>
  >;
  openSubscription: (channel?: NotificationChannel) => void;
}
