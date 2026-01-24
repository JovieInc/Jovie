import type React from 'react';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';
import type { ProfileNotificationsState } from '../hooks/useProfileNotificationsController';

export interface ProfileNotificationsMenuProps {
  channelBusy: Partial<Record<NotificationChannel, boolean>>;
  hasActiveSubscriptions: boolean;
  notificationsState: ProfileNotificationsState;
  onAddChannel: (channel?: NotificationChannel) => void;
  onOpenChange: (open: boolean) => void;
  onUnsubscribe: (channel: NotificationChannel) => Promise<void> | void;
  open: boolean;
  subscribedChannels: NotificationSubscriptionState;
  subscriptionDetails: NotificationContactValues;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
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
