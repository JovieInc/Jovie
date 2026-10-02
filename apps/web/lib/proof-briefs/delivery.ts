import type { RecipientPreferences } from '@/lib/notifications/recipient-preferences';
import type { NotificationMessage } from '@/types/notifications';
import type { CertifiedProofBrief } from './contract';
import { renderProofBriefEmail } from './email';

export type CustomerRecapDeliveryBlock =
  | 'customer-suppressed'
  | 'email-disabled'
  | 'marketing-consent-required';

export type PreparedCustomerRecapEmail =
  | {
      readonly status: 'blocked';
      readonly reason: CustomerRecapDeliveryBlock;
    }
  | {
      readonly status: 'ready';
      readonly message: NotificationMessage;
    };

/**
 * Prepare, but never send or enroll, a weekly recap. A caller may pass a ready
 * message only to the existing sendNotification path, which rechecks global
 * email suppression and records the delivery receipt.
 */
export function prepareCustomerRecapEmail(input: {
  readonly brief: CertifiedProofBrief;
  readonly preferences: RecipientPreferences;
  readonly outboundSuppressedAt: string | null;
  readonly now?: Date;
}): PreparedCustomerRecapEmail {
  if (input.outboundSuppressedAt) {
    return { status: 'blocked', reason: 'customer-suppressed' };
  }
  if (!input.preferences.channels.email) {
    return { status: 'blocked', reason: 'email-disabled' };
  }
  if (
    !input.preferences.marketingOptIn ||
    !input.preferences.marketingConsent
  ) {
    return { status: 'blocked', reason: 'marketing-consent-required' };
  }

  const email = renderProofBriefEmail(input.brief, { now: input.now });
  const identity = `${input.brief.briefId}:rev:${input.brief.revision}:email`;
  return {
    status: 'ready',
    message: {
      id: identity,
      dedupKey: identity,
      idempotencyKey: identity,
      category: 'marketing',
      channels: ['email'],
      respectUserPreferences: true,
      subject: email.subject,
      text: email.text,
      html: email.html,
      metadata: {
        schema: input.brief.schema,
        briefId: input.brief.briefId,
        revision: input.brief.revision,
        windowStart: input.brief.window.start,
        windowEnd: input.brief.window.end,
      },
    },
  };
}
