import { getNotificationCaptureError } from '@/lib/validation/schemas/notifications';

const EMAIL_MAX_LENGTH = 254;
const PHONE_MAX_LENGTH = 32;

export function normalizeSubscriptionEmail(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > EMAIL_MAX_LENGTH) return null;
  if (getNotificationCaptureError({ channel: 'email', value: trimmed })) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function normalizeSubscriptionPhone(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > PHONE_MAX_LENGTH) return null;

  let normalized = trimmed.replaceAll(/(?!^\+)[^\d]/g, '');

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }

  normalized = `+${normalized.slice(1).replaceAll(/\D/g, '')}`;

  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
    return null;
  }

  return normalized;
}
