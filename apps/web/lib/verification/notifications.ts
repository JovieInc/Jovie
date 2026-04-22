import 'server-only';

import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { sendEmail } from '@/lib/email/send';
import { escapeHtml } from '@/lib/email/utils';
import {
  type SlackNotificationResult,
  sendSlackMessage,
} from '@/lib/notifications/providers/slack';
import {
  formatFounderSender,
  getSenderPolicy,
} from '@/lib/notifications/sender-policy';
import { logger } from '@/lib/utils/logger';

interface VerificationRequestPayload {
  name: string;
  email: string | null;
  username: string | null;
  profileId: string;
}

export async function notifyVerificationRequest(
  payload: VerificationRequestPayload
): Promise<SlackNotificationResult> {
  const profilePath = payload.username
    ? `/${payload.username}`
    : `${APP_ROUTES.ADMIN_CREATORS}?profileId=${payload.profileId}`;
  const profileUrl = `${BASE_URL}${profilePath}`;

  return sendSlackMessage({
    text: `${payload.name} requested profile verification`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Verification request*\n*User:* ${payload.name}\n*Email:* ${payload.email ?? 'Unavailable'}\n*Profile:* <${profileUrl}|Open profile>`,
        },
      },
    ],
  });
}

interface VerificationApprovedPayload {
  to: string;
  firstName: string;
}

function getSafeGreetingName(firstName: string): string | null {
  const trimmed = firstName.trim();
  if (trimmed.length < 2 || trimmed.length > 40) {
    return null;
  }

  if (!/^[A-Za-z][A-Za-z' -]*[A-Za-z]$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export async function sendVerificationApprovedEmail(
  payload: VerificationApprovedPayload
): Promise<void> {
  const founderSender = getSenderPolicy('founder');
  const greetingName = getSafeGreetingName(payload.firstName) ?? 'Hey there';
  const safeGreetingName = escapeHtml(greetingName);
  const message =
    `${greetingName},\n\n` +
    'Hey, just saw you requested verification - pushed it through for you. Really excited to have you on the product. Let me know if you have any questions or feedback.\n\n' +
    '- Tim';
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick update from Tim</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 520px; margin: 0 auto;">
          <tr>
            <td style="font-size: 15px; line-height: 1.7; color: #333;">
              <p style="margin: 0 0 16px;">${safeGreetingName},</p>
              <p style="margin: 0 0 16px;">Hey, just saw you requested verification - pushed it through for you. Really excited to have you on the product. Let me know if you have any questions or feedback.</p>
              <p style="margin: 0;">- Tim</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const result = await sendEmail({
    to: payload.to,
    from: formatFounderSender(),
    replyTo: founderSender.replyToEmail,
    subject: 'Quick update from Tim',
    text: message,
    html,
  });

  if (!result.success) {
    logger.warn('Verification approval email was not sent', {
      error: result.error,
      toDomain: payload.to.split('@')[1] ?? 'unknown',
    });
  }
}
