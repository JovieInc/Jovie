import type React from 'react';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationContentPreferences,
  NotificationSubscriptionState,
} from '@/types/notifications';
import type { ProfileNotificationsState } from '../hooks/useProfileNotificationsController';

export interface ProfileNotificationsMenuProps {
  readonly artistId: string;
  readonly channelBusy: Partial<Record<NotificationChannel, boolean>>;
  readonly contentPreferences?: NotificationContentPreferences;
  readonly hasActiveSubscriptions: boolean;
  readonly notificationsState: ProfileNotificationsState;
  readonly onAddChannel: (channel?: NotificationChannel) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUnsubscribe: (
    channel: NotificationChannel
  ) => Promise<void> | void;
  readonly open: boolean;
  readonly subscribedChannels: NotificationSubscriptionState;
  readonly subscriptionDetails: NotificationContactValues;
  readonly triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export interface UseNotificationConfirmReturn {
  confirmChannel: NotificationChannel | null;
  isConfirming: boolean;
  openConfirmDialog: (channel: NotificationChannel) => void;
  closeConfirmDialog: () => void;
  handleConfirm: (
    onUnsubscribe: (channel: NotificationChannel) => Promise<void> | void
  ) => void;
}
