import { EMAIL_REPLY_TO } from '@/lib/notifications/config';
import {
  getNotificationPreferences,
  markNotificationDismissed,
} from '@/lib/notifications/preferences';
import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import {
  isEmailSuppressed,
  logDelivery,
} from '@/lib/notifications/suppression';
import type {
  EmailProvider,
  NotificationChannelResult,
  NotificationDeliveryChannel,
  NotificationDispatchResult,
  NotificationMessage,
  NotificationTarget,
} from '@/types/notifications';

let emailProvider: EmailProvider = new ResendEmailProvider();

export const setEmailProvider = (provider: EmailProvider) => {
  emailProvider = provider;
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

/**
 * Handle sending a notification via email channel
 */
async function handleEmailChannel(
  message: NotificationMessage,
  target: NotificationTarget,
  preferences: Awaited<ReturnType<typeof getNotificationPreferences>>
): Promise<NotificationChannelResult> {
  const to = target.email ?? preferences.email ?? null;

  if (!to) {
    return buildSkippedResult('email', 'No email available');
  }

  // Check global suppression list (bounces, complaints, etc.)
  const suppressionCheck = await isEmailSuppressed(to);
  if (suppressionCheck.suppressed) {
    const detail = `Email suppressed: ${suppressionCheck.reason}`;
    await logDelivery({
      channel: 'email',
      recipientEmail: to,
      status: 'suppressed',
      metadata: {
        suppressionReason: suppressionCheck.reason,
        notificationId: message.id,
      },
    });
    return buildSkippedResult('email', detail);
  }

  const respectPreferences =
    message.respectUserPreferences !== false &&
    message.category !== 'transactional';

  if (respectPreferences && !preferences.marketingEmails) {
    return buildSkippedResult('email', 'Marketing emails are disabled');
  }

  const emailResult = await emailProvider.sendEmail({
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo ?? EMAIL_REPLY_TO,
    headers: message.headers,
    from: message.from,
  });

  // Log delivery for tracking
  if (emailResult.status === 'sent') {
    await logDelivery({
      channel: 'email',
      recipientEmail: to,
      status: 'sent',
      providerMessageId: emailResult.detail,
      metadata: { notificationId: message.id },
    });
  } else if (emailResult.status === 'error') {
    await logDelivery({
      channel: 'email',
      recipientEmail: to,
      status: 'failed',
      errorMessage: emailResult.error,
      metadata: { notificationId: message.id },
    });
  }

  return emailResult;
}

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
      const emailResult = await handleEmailChannel(
        message,
        target,
        preferences
      );
      results.push(emailResult);
      continue;
    }

    // Placeholder for push or in-app transports
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
