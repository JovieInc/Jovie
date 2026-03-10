import 'server-only';

import { APP_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { sendEmail } from '@/lib/email/send';
import { EMAIL_FROM_ADDRESS } from '@/lib/notifications/config';
import {
  type SlackNotificationResult,
  sendSlackMessage,
} from '@/lib/notifications/providers/slack';
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
  const profileUrl = `${APP_URL}${profilePath}`;

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

export async function sendVerificationApprovedEmail(
  payload: VerificationApprovedPayload
): Promise<void> {
  const message =
    `${payload.firstName},\n\n` +
    'Hey, just saw you requested verification — pushed it through for you. Really excited to have you on the product. Let me know if you have any questions or feedback.\n\n' +
    '— Tim';

  const result = await sendEmail({
    to: payload.to,
    from: `Tim White <${EMAIL_FROM_ADDRESS}>`,
    subject: 'Quick update from Tim',
    text: message,
    html: `<p>${payload.firstName},</p><p>Hey, just saw you requested verification — pushed it through for you. Really excited to have you on the product. Let me know if you have any questions or feedback.</p><p>— Tim</p>`,
  });

  if (!result.success) {
    logger.warn('Verification approval email was not sent', {
      error: result.error,
      toDomain: payload.to.split('@')[1] ?? 'unknown',
    });
  }
}
