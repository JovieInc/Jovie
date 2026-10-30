/**
 * Email Send Utility
 *
 * Result-object wrapper over the send gateway (lib/email/gateway). Every
 * call declares its stream, purpose and consent basis; the gateway decides
 * the provider, sender address and policy from the stream registry.
 */

import { sendStreamEmail } from '@/lib/email/gateway';
import { logger } from '@/lib/utils/logger';
import type { EmailRoute } from '@/types/notifications';

export interface SendEmailOptions extends EmailRoute {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Display name only; the address comes from the stream registry. */
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send one email through the gateway.
 *
 * Returns a result object instead of throwing, so callers can
 * decide how to handle failures (log-and-continue, retry, etc.).
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const result = await sendStreamEmail({
    stream: options.stream,
    purpose: options.purpose,
    consent: { basis: options.consent },
    ...(options.approvalCardId && {
      approval: { cardId: options.approvalCardId },
    }),
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    ...(options.fromName !== undefined && { fromName: options.fromName }),
    ...(options.replyTo !== undefined && { replyTo: options.replyTo }),
    ...(options.headers && { headers: options.headers }),
    ...(options.idempotencyKey && { idempotencyKey: options.idempotencyKey }),
  });

  if (result.status === 'sent') {
    return { success: true, messageId: result.messageId ?? undefined };
  }

  const domain = options.to.split('@')[1]; // domain only for PII
  if (result.status === 'skipped') {
    logger.info('Email send skipped', {
      to: domain,
      stream: options.stream,
      reason: result.code,
    });
    return { success: false, error: `${result.code}: ${result.detail}` };
  }

  const error =
    result.status === 'rejected'
      ? `${result.code}: ${result.detail}`
      : result.error;
  logger.error('Email send failed', {
    to: domain,
    stream: options.stream,
    error,
  });
  return { success: false, error };
}

/**
 * Send a tip thank-you email.
 *
 * Convenience wrapper that constructs email content from template data
 * and sends via the shared provider.
 */
export async function sendTipThankYouEmail(options: {
  to: string;
  artistName: string;
  artistPhoto?: string | null;
  amount: number;
  musicLinks?: {
    spotify?: string | null;
    appleMusic?: string | null;
    youtube?: string | null;
  };
  socialLinks?: Array<{ platform: string; url: string }>;
  profileHandle: string;
  profileId: string;
  fanName?: string | null;
  unsubscribeToken?: string | null;
}): Promise<SendEmailResult> {
  // Lazy import to avoid circular dependencies
  const { getTipThankYouEmail } = await import(
    '@/lib/email/templates/tip-thank-you'
  );

  const emailContent = getTipThankYouEmail({
    fanName: options.fanName,
    artistName: options.artistName,
    profileHandle: options.profileHandle,
    artistPhoto: options.artistPhoto,
    amountCents: options.amount,
    musicLinks: options.musicLinks,
    socialLinks: options.socialLinks,
    unsubscribeToken: options.unsubscribeToken,
    profileId: options.profileId,
    recipientEmail: options.to,
  });

  return sendEmail({
    stream: 'transactional',
    purpose: 'tip-thank-you',
    consent: 'account-transaction',
    to: options.to,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });
}
