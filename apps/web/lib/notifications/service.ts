import { captureError } from '@/lib/error-tracking';
import { EMAIL_REPLY_TO } from '@/lib/notifications/config';
import {
  getNotificationPreferences,
  markNotificationDismissed,
} from '@/lib/notifications/preferences';
import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import {
  type SendSmsResult,
  sendTwilioSms,
} from '@/lib/notifications/providers/sms/twilio-sender';
import { checkQuota, incrementQuota } from '@/lib/notifications/quota';
import { checkReputation, recordSend } from '@/lib/notifications/reputation';
import { formatSystemSender } from '@/lib/notifications/sender-policy';
import {
  isPhoneSmsSuppressed,
  suppressPhoneForStop,
} from '@/lib/notifications/sms-suppression';
import {
  isEmailSuppressed,
  logDelivery,
} from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';
import type {
  EmailProvider,
  NotificationChannelResult,
  NotificationDeliveryChannel,
  NotificationDispatchResult,
  NotificationMessage,
  NotificationTarget,
  SenderContext,
} from '@/types/notifications';

let emailProvider: EmailProvider = new ResendEmailProvider();

export const setEmailProvider = (provider: EmailProvider) => {
  emailProvider = provider;
};

/**
 * Outbound SMS provider hook. Defaults to Twilio. Tests inject a stub via
 * `setSmsProvider`; production code should always use the default.
 */
export type SmsSender = (params: {
  to: string;
  body: string;
}) => Promise<SendSmsResult>;

let smsProvider: SmsSender = ({ to, body }) => sendTwilioSms({ to, body });

export const setSmsProvider = (provider: SmsSender) => {
  smsProvider = provider;
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

const buildErrorResult = (
  channel: NotificationDeliveryChannel,
  error: string
): NotificationChannelResult => ({
  channel,
  status: 'error',
  error,
});

/**
 * Build the "From" address with dynamic sender name.
 * Implements the Laylo pattern: "Artist Name via Jovie <notifications@send.jov.ie>"
 */
function buildFromAddress(senderContext?: SenderContext): string {
  return formatSystemSender(senderContext?.displayName);
}

/**
 * Check sender quota and reputation before sending
 */
async function checkSenderEligibility(
  senderContext: SenderContext
): Promise<{ eligible: boolean; reason?: string }> {
  const { creatorProfileId } = senderContext;

  // Check reputation first (more serious)
  const reputationCheck = await checkReputation(creatorProfileId);
  if (!reputationCheck.canSend) {
    logger.warn('[notifications] Send blocked by reputation', {
      creatorProfileId,
      status: reputationCheck.status,
      reason: reputationCheck.reason,
    });
    return {
      eligible: false,
      reason: reputationCheck.reason ?? 'Sending blocked due to reputation',
    };
  }

  // Check quota
  const quotaCheck = await checkQuota(creatorProfileId);
  if (!quotaCheck.allowed) {
    logger.info('[notifications] Send blocked by quota', {
      creatorProfileId,
      reason: quotaCheck.reason,
      remaining: quotaCheck.remaining,
    });
    return {
      eligible: false,
      reason:
        quotaCheck.reason === 'daily_limit'
          ? 'Daily email limit reached'
          : 'Monthly email limit reached',
    };
  }

  return { eligible: true };
}

/**
 * Handle successful email send tracking
 */
async function handleEmailSent(
  to: string,
  providerMessageId: string | undefined,
  message: NotificationMessage,
  senderContext: SenderContext | undefined
): Promise<void> {
  await logDelivery({
    channel: 'email',
    recipientEmail: to,
    status: 'sent',
    providerMessageId,
    metadata: {
      notificationId: message.id,
      ...(senderContext && {
        creatorProfileId: senderContext.creatorProfileId,
        emailType: senderContext.emailType,
      }),
    },
  });

  // Track quota and reputation for sender
  if (senderContext && providerMessageId) {
    await incrementQuota(senderContext.creatorProfileId);
    await recordSend(
      senderContext.creatorProfileId,
      providerMessageId,
      to,
      senderContext.emailType,
      senderContext.referenceId
    );
  }
}

/**
 * Handle failed email send tracking
 */
async function handleEmailError(
  to: string,
  errorMessage: string | undefined,
  message: NotificationMessage,
  senderContext: SenderContext | undefined
): Promise<void> {
  await logDelivery({
    channel: 'email',
    recipientEmail: to,
    status: 'failed',
    errorMessage,
    metadata: {
      notificationId: message.id,
      ...(senderContext && {
        creatorProfileId: senderContext.creatorProfileId,
      }),
    },
  });
}

/**
 * Handle sending a notification via email channel
 */
async function handleEmailChannel(
  message: NotificationMessage,
  target: NotificationTarget,
  preferences: Awaited<ReturnType<typeof getNotificationPreferences>>
): Promise<NotificationChannelResult> {
  const to = target.email ?? preferences.email ?? null;
  const senderContext = message.senderContext;

  if (!to) {
    return buildSkippedResult('email', 'No email available');
  }

  // Check sender eligibility if sending on behalf of a creator
  if (senderContext) {
    const eligibility = await checkSenderEligibility(senderContext);
    if (!eligibility.eligible) {
      await logDelivery({
        channel: 'email',
        recipientEmail: to,
        status: 'failed',
        errorMessage: eligibility.reason,
        metadata: {
          notificationId: message.id,
          creatorProfileId: senderContext.creatorProfileId,
          blockedReason: eligibility.reason,
        },
      });
      return buildErrorResult('email', eligibility.reason ?? 'Send blocked');
    }
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
        ...(senderContext && {
          creatorProfileId: senderContext.creatorProfileId,
        }),
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

  // Build dynamic from address and reply-to
  const fromAddress = message.from ?? buildFromAddress(senderContext);
  const replyTo =
    message.replyTo ?? senderContext?.replyToEmail ?? EMAIL_REPLY_TO;

  const emailResult = await emailProvider.sendEmail({
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo,
    headers: message.headers,
    from: fromAddress,
  });

  // Handle post-send tracking
  if (emailResult.status === 'sent') {
    await handleEmailSent(to, emailResult.detail, message, senderContext);
  } else if (emailResult.status === 'error') {
    await handleEmailError(to, emailResult.error, message, senderContext);
  }

  return emailResult;
}

/**
 * Handle sending a notification via SMS channel.
 *
 * SMS sends are gated by `notification_contacts.smsStatus` (the global
 * STOP/blocked ledger). Per-artist consent and unsubscribe are enforced
 * upstream by the release scheduler / subscribe flow; here we just trust
 * `target.phone` and apply suppression + provider call.
 */
async function handleSmsChannel(
  message: NotificationMessage,
  target: NotificationTarget
): Promise<NotificationChannelResult> {
  const to = target.phone ?? null;
  const senderContext = message.senderContext;

  if (!to) {
    return buildSkippedResult('sms', 'No phone available');
  }

  const suppression = await isPhoneSmsSuppressed(to);
  if (suppression.suppressed) {
    const detail = `SMS suppressed: ${suppression.reason ?? 'unknown'}`;
    await logDelivery({
      channel: 'sms',
      recipientPhone: to,
      status: 'suppressed',
      metadata: {
        suppressionReason: suppression.reason,
        notificationId: message.id,
        ...(senderContext && {
          creatorProfileId: senderContext.creatorProfileId,
        }),
      },
    });
    return buildSkippedResult('sms', detail);
  }

  const body = message.text.trim();
  const result = await smsProvider({ to, body });

  if (result.success) {
    await logDelivery({
      channel: 'sms',
      recipientPhone: to,
      status: 'sent',
      providerMessageId: result.providerMessageId,
      metadata: {
        notificationId: message.id,
        provider: 'twilio',
        twilioStatus: result.status,
        ...(senderContext && {
          creatorProfileId: senderContext.creatorProfileId,
          emailType: senderContext.emailType,
        }),
      },
    });
    return {
      channel: 'sms',
      status: 'sent',
      provider: 'twilio',
      detail: result.providerMessageId,
    };
  }

  await logDelivery({
    channel: 'sms',
    recipientPhone: to,
    status: 'failed',
    errorMessage: result.error,
    metadata: {
      notificationId: message.id,
      provider: 'twilio',
      twilioErrorCode: result.errorCode,
      twilioHttpStatus: result.httpStatus,
      retryable: result.retryable,
      ...(senderContext && {
        creatorProfileId: senderContext.creatorProfileId,
      }),
    },
  });
  logger.warn('[notifications] SMS send failed', {
    error: result.error,
    errorCode: result.errorCode,
    httpStatus: result.httpStatus,
    notificationId: message.id,
  });
  if (result.error) {
    captureError('SMS send failed', new Error(result.error), {
      notificationId: message.id,
      errorCode: result.errorCode,
      httpStatus: result.httpStatus,
      provider: 'twilio',
    });
  }

  // Twilio error 21610 = "Attempt to send to unsubscribed recipient." If a
  // STOP webhook was missed (or the carrier opt-out happened out-of-band),
  // honor it now so we never bill another segment to this number.
  if (result.errorCode === '21610') {
    try {
      await suppressPhoneForStop(to, {
        source: 'twilio_21610',
        providerEventId: message.id,
      });
    } catch (suppressError) {
      logger.warn('[notifications] Failed to record suppression after 21610', {
        notificationId: message.id,
        error:
          suppressError instanceof Error ? suppressError.message : 'unknown',
      });
    }
  }

  return buildErrorResult('sms', result.error);
}

export const sendNotification = async (
  message: NotificationMessage,
  target: NotificationTarget
): Promise<NotificationDispatchResult> => {
  const channels = Array.from(new Set(message.channels ?? DEFAULT_CHANNELS));

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

    if (channel === 'sms') {
      const smsResult = await handleSmsChannel(message, target);
      results.push(smsResult);
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
