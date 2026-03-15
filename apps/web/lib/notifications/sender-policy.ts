import { APP_NAME } from '@/constants/app';
import { env } from '@/lib/env-server';

export const FOUNDER_FROM_EMAIL = 'tim@notify.jov.ie';
export const SYSTEM_FROM_EMAIL =
  env.RESEND_FROM_EMAIL ?? 'notifications@notify.jov.ie';

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
