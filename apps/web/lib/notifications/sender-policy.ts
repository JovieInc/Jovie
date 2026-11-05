import { APP_NAME } from '@/constants/app';
import { streamFromEmail, streamPolicy } from '@/lib/email/streams';

/**
 * Sender addresses for display and copy. They derive from the stream
 * registry (apps/web/lib/email/stream-registry.json); the send gateway sets
 * the real From header, so nothing here is passed to a provider.
 */
export const FOUNDER_FROM_EMAIL = streamFromEmail('founder') ?? '';
export const SYSTEM_FROM_EMAIL = streamFromEmail('transactional') ?? '';

export const FOUNDER_REPLY_TO_EMAIL =
  streamPolicy('founder').replyTo ?? FOUNDER_FROM_EMAIL;
export const SYSTEM_REPLY_TO_EMAIL =
  streamPolicy('transactional').replyTo ?? SYSTEM_FROM_EMAIL;

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

/**
 * Display name for mail sent on a creator's behalf ("Artist via Jovie").
 * Undefined means the stream's default name.
 */
export function systemSenderName(displayName?: string): string | undefined {
  if (!displayName) return undefined;
  const sanitized = sanitizeDisplayName(displayName);
  return sanitized ? `${sanitized} via ${APP_NAME}` : undefined;
}

export function formatFounderSender(name = 'Tim White'): string {
  const { fromEmail } = getSenderPolicy('founder');
  return `${sanitizeDisplayName(name)} <${fromEmail}>`;
}

export function formatSystemSender(displayName?: string): string {
  const { fromEmail } = getSenderPolicy('system');
  return `${systemSenderName(displayName) ?? APP_NAME} <${fromEmail}>`;
}
