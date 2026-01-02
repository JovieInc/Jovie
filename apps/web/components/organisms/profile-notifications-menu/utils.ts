import type { NotificationChannel } from '@/types/notifications';

/**
 * Get display label for a notification channel
 */
export function labelForChannel(channel: NotificationChannel): string {
  return channel === 'sms' ? 'SMS' : 'Email';
}
