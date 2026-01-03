'use client';

import { useState } from 'react';
import type { NotificationChannel } from '@/types/notifications';
import type { UseNotificationConfirmReturn } from './types';

export function useNotificationConfirm(): UseNotificationConfirmReturn {
  const [confirmChannel, setConfirmChannel] =
    useState<NotificationChannel | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const openConfirmDialog = (channel: NotificationChannel) => {
    setConfirmChannel(channel);
  };

  const closeConfirmDialog = () => {
    setConfirmChannel(null);
    setIsConfirming(false);
  };

  const handleConfirm = (
    onUnsubscribe: (channel: NotificationChannel) => Promise<void> | void
  ) => {
    if (!confirmChannel) return;
    setIsConfirming(true);
    void (async () => {
      await onUnsubscribe(confirmChannel);
      setIsConfirming(false);
      setConfirmChannel(null);
    })();
  };

  return {
    confirmChannel,
    isConfirming,
    openConfirmDialog,
    closeConfirmDialog,
    handleConfirm,
  };
}
