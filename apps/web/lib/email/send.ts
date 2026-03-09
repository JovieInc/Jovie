/**
 * Email Send Utility
 *
 * Thin wrapper around the Resend email provider for sending
 * transactional emails from services.
 */

import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import { logger } from '@/lib/utils/logger';

/** Singleton email provider instance */
let providerInstance: ResendEmailProvider | null = null;

function getProvider(): ResendEmailProvider {
  providerInstance ??= new ResendEmailProvider();
  return providerInstance;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a transactional email via Resend.
 *
 * Returns a result object instead of throwing, so callers can
 * decide how to handle failures (log-and-continue, retry, etc.).
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const provider = getProvider();

  const result = await provider.sendEmail({
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    from: options.from,
    replyTo: options.replyTo,
  });

  if (result.status === 'sent') {
    return { success: true, messageId: result.detail };
  }

  if (result.status === 'skipped') {
    logger.info('Email send skipped', {
      to: options.to.split('@')[1], // domain only for PII
      reason: result.detail,
    });
    return { success: false, error: result.detail || 'Email sending skipped' };
  }

  logger.error('Email send failed', {
    to: options.to.split('@')[1],
    error: result.error,
  });
  return { success: false, error: result.error || 'Email send failed' };
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
  });

  return sendEmail({
    to: options.to,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });
}
