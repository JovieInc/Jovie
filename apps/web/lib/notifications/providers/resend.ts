import { Resend } from 'resend';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import {
  EMAIL_FROM_ADDRESS,
  EMAIL_REPLY_TO,
  NOTIFICATIONS_BRAND_NAME,
  RESEND_ENABLED,
} from '@/lib/notifications/config';
import type {
  EmailMessage,
  EmailProvider,
  NotificationChannelResult,
  NotificationDeliveryChannel,
} from '@/types/notifications';

let client: Resend | null = null;

const getClient = () => {
  if (!client) {
    client = new Resend(env.RESEND_API_KEY ?? '');
  }

  return client;
};

export class ResendEmailProvider implements EmailProvider {
  provider: EmailProvider['provider'] = 'resend';

  async sendEmail(message: EmailMessage): Promise<NotificationChannelResult> {
    if (!RESEND_ENABLED || !env.RESEND_API_KEY) {
      return {
        channel: 'email' as NotificationDeliveryChannel,
        status: 'skipped',
        provider: this.provider,
        detail: 'RESEND_API_KEY not configured',
      };
    }

    try {
      const resend = getClient();
      const response = await resend.emails.send({
        from:
          message.from ?? `${NOTIFICATIONS_BRAND_NAME} <${EMAIL_FROM_ADDRESS}>`,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo ?? EMAIL_REPLY_TO,
        headers: message.headers,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return {
        channel: 'email' as NotificationDeliveryChannel,
        status: 'sent',
        provider: this.provider,
        detail: response.data?.id ?? 'resend',
      };
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Unknown Resend error';

      captureError('[notifications] Resend sendEmail error', error, {
        to: message.to,
        subject: message.subject,
      });

      return {
        channel: 'email' as NotificationDeliveryChannel,
        status: 'error',
        provider: this.provider,
        error: messageText,
      };
    }
  }
}
