import { APP_NAME } from '@/constants/app';
import { requireStreamDomain } from '@/lib/email/streams';
import { env } from '@/lib/env-server';

// Founder mail lives on its own stream domain (EMAIL_STREAM_FOUNDER_DOMAIN),
// so a lifecycle or transactional problem cannot burn 1:1 mail to users.
export const FOUNDER_FROM_EMAIL = `tim@${requireStreamDomain('founder', env)}`;
export const SYSTEM_FROM_EMAIL =
  env.RESEND_FROM_EMAIL ??
  `notifications@${requireStreamDomain('transactional', env)}`;

export const FOUNDER_REPLY_TO_EMAIL = 'tim@jov.ie';
export const SYSTEM_REPLY_TO_EMAIL =
  env.RESEND_REPLY_TO_EMAIL ?? SYSTEM_FROM_EMAIL;

export type SenderClass = 'founder' | 'system';

export interface SenderPolicy {
  fromEmail: string;
  replyToEmail: string;
}

function sanitizeDisplayName(displayName: string): string {
  return displayName.replaceAll(/["<>]/g, '').trim().slice(0, 64);
}

export function getSenderPolicy(senderClass: SenderClass): SenderPolicy {
  if (senderClass === 'founder') {
    return {
      fromEmail: FOUNDER_FROM_EMAIL,
      replyToEmail: FOUNDER_REPLY_TO_EMAIL,
    };
  }

  return {
    fromEmail: SYSTEM_FROM_EMAIL,
    replyToEmail: SYSTEM_REPLY_TO_EMAIL,
  };
}

export function formatFounderSender(name = 'Tim White'): string {
  const { fromEmail } = getSenderPolicy('founder');
  return `${sanitizeDisplayName(name)} <${fromEmail}>`;
}

export function formatSystemSender(displayName?: string): string {
  const { fromEmail } = getSenderPolicy('system');

  if (!displayName) {
    return `${APP_NAME} <${fromEmail}>`;
  }

  const sanitizedName = sanitizeDisplayName(displayName);
  if (!sanitizedName) {
    return `${APP_NAME} <${fromEmail}>`;
  }

  return `${sanitizedName} via ${APP_NAME} <${fromEmail}>`;
}
