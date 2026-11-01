import { sendStreamEmail } from '@/lib/email/gateway';
import type {
  EmailMessage,
  EmailProvider,
  NotificationChannelResult,
} from '@/types/notifications';

/**
 * EmailProvider over the send gateway. Every app email reaches the provider
 * (Resend) only through sendStreamEmail, which applies the stream registry.
 */
export class GatewayEmailProvider implements EmailProvider {
  provider: EmailProvider['provider'] = 'gateway';

  async sendEmail(message: EmailMessage): Promise<NotificationChannelResult> {
    const result = await sendStreamEmail({
      stream: message.stream,
      purpose: message.purpose,
      consent: { basis: message.consent },
      ...(message.approvalCardId && {
        approval: { cardId: message.approvalCardId },
      }),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined && { html: message.html }),
      ...(message.fromName !== undefined && { fromName: message.fromName }),
      ...(message.fromLocalPart !== undefined && {
        fromLocalPart: message.fromLocalPart,
      }),
      ...(message.replyTo !== undefined && { replyTo: message.replyTo }),
      ...(message.cc && { cc: message.cc }),
      ...(message.headers && { headers: message.headers }),
      ...(message.attachments && { attachments: message.attachments }),
      ...(message.idempotencyKey && { idempotencyKey: message.idempotencyKey }),
    });

    switch (result.status) {
      case 'sent':
        return {
          channel: 'email',
          status: 'sent',
          provider: this.provider,
          detail: result.messageId ?? 'sent',
        };
      case 'skipped':
        return {
          channel: 'email',
          status: 'skipped',
          provider: this.provider,
          detail: `${result.code}: ${result.detail}`,
        };
      case 'rejected':
        return {
          channel: 'email',
          status: 'error',
          provider: this.provider,
          error: `${result.code}: ${result.detail}`,
        };
      default:
        return {
          channel: 'email',
          status: 'error',
          provider: this.provider,
          error: result.error,
        };
    }
  }
}
