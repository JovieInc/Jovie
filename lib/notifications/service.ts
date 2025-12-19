import { EMAIL_REPLY_TO } from '@/lib/notifications/config';
import {
  getNotificationPreferences,
  markNotificationDismissed,
} from '@/lib/notifications/preferences';
import { InAppStubProvider } from '@/lib/notifications/providers/in-app';
import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import { SmsStubProvider } from '@/lib/notifications/providers/sms';
import type { NotificationProvider } from '@/lib/notifications/providers/types';
import type {
  InAppMessage,
  NotificationChannelResult,
  NotificationDeliveryChannel,
  NotificationDispatchResult,
  NotificationMessage,
  NotificationTarget,
  SmsMessage,
} from '@/types/notifications';

let emailProvider: NotificationProvider = new ResendEmailProvider();
let smsProvider: NotificationProvider = new SmsStubProvider();
let inAppProvider: NotificationProvider = new InAppStubProvider();

export const setEmailProvider = (provider: NotificationProvider) => {
  emailProvider = provider;
};

export const setSmsProvider = (provider: NotificationProvider) => {
  smsProvider = provider;
};

export const setInAppProvider = (provider: NotificationProvider) => {
  inAppProvider = provider;
};

const DEFAULT_CHANNELS: NotificationDeliveryChannel[] = ['email'];

const buildSkippedResult = (
  channel: NotificationDeliveryChannel,
  detail: string
): NotificationChannelResult => ({
  channel,
  status: 'skipped',
  detail,
});

export const sendNotification = async (
  message: NotificationMessage,
  target: NotificationTarget
): Promise<NotificationDispatchResult> => {
  const channels = Array.from(
    new Set(message.channels ?? DEFAULT_CHANNELS)
  ) as NotificationDeliveryChannel[];

  const preferences = await getNotificationPreferences(target);
  const dedupKey = message.dedupKey ?? message.id;

  if (
    message.dismissible !== false &&
    dedupKey &&
    preferences.dismissedNotificationIds.includes(dedupKey)
  ) {
    const skipped = buildSkippedResult(
      channels[0] ?? 'email',
      'Notification dismissed across channels'
    );
    return {
      results: [skipped],
      delivered: [],
      skipped: [skipped],
      errors: [],
      dedupKey,
    };
  }

  const results: NotificationChannelResult[] = [];

  for (const channel of channels) {
    const isChannelEnabled = preferences.channels[channel] ?? false;

    if (!isChannelEnabled) {
      results.push(
        buildSkippedResult(channel, 'Channel disabled by preferences')
      );
      continue;
    }

    if (channel === 'email') {
      const to = target.email ?? preferences.email ?? null;

      if (!to) {
        results.push(buildSkippedResult(channel, 'No email available'));
        continue;
      }

      const respectPreferences =
        message.respectUserPreferences !== false &&
        message.category !== 'transactional';

      if (respectPreferences && !preferences.marketingEmails) {
        results.push(
          buildSkippedResult(channel, 'Marketing emails are disabled')
        );
        continue;
      }

      const emailSender = emailProvider.sendEmail;

      if (!emailSender) {
        results.push(buildSkippedResult(channel, 'Email provider unavailable'));
        continue;
      }

      const emailResult = await emailSender({
        to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo ?? EMAIL_REPLY_TO,
        headers: message.headers,
        from: message.from,
      });

      results.push(emailResult);
      continue;
    }

    if (channel === 'sms') {
      const to = target.phone ?? null;

      if (!to) {
        results.push(buildSkippedResult(channel, 'No phone number available'));
        continue;
      }

      const smsSender = smsProvider.sendSms;

      if (!smsSender) {
        results.push(buildSkippedResult(channel, 'SMS provider unavailable'));
        continue;
      }

      const smsResult = await smsSender({
        to,
        text: message.text,
        metadata: message.metadata,
      } satisfies SmsMessage);

      results.push(smsResult);
      continue;
    }

    if (channel === 'in_app') {
      const inAppSender = inAppProvider.sendInApp;

      if (!inAppSender) {
        results.push(
          buildSkippedResult(channel, 'In-app provider unavailable')
        );
        continue;
      }

      const inAppResult = await inAppSender({
        userId: target.userId,
        clerkUserId: target.clerkUserId,
        subject: message.subject,
        text: message.text,
        ctaUrl: message.ctaUrl,
        metadata: message.metadata,
      } satisfies InAppMessage);

      results.push(inAppResult);
      continue;
    }

    results.push(buildSkippedResult(channel, 'Channel not implemented yet'));
  }

  return {
    results,
    delivered: results
      .filter(result => result.status === 'sent')
      .map(result => result.channel),
    skipped: results.filter(result => result.status === 'skipped'),
    errors: results.filter(result => result.status === 'error'),
    dedupKey,
  };
};

export const dismissNotification = async (
  notificationId: string,
  target: NotificationTarget
) => {
  await markNotificationDismissed(notificationId, target);
};
