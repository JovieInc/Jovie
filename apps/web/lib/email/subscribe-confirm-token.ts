/**
 * Subscribe Confirmation Token Utilities
 *
 * Generates and verifies HMAC-signed tokens for double opt-in email verification.
 */

import { APP_URL } from '@/constants/app';
import {
  buildTokenUrl,
  deriveSecret,
  MAC_HEX_LENGTH_LEGACY,
  parseColonPayload,
  signPayload,
  verifyToken,
} from './hmac-token';

const CONFIRM_DOMAIN = 'jovie:subscribe-confirm-token-secret';

export function generateSubscribeConfirmToken(
  subscriptionId: string,
  email: string
): string | null {
  const secret = deriveSecret(CONFIRM_DOMAIN);
  const normalizedEmail = email.toLowerCase().trim();
  return signPayload(
    `${subscriptionId}:${normalizedEmail}`,
    secret,
    MAC_HEX_LENGTH_LEGACY
  );
}

export function verifySubscribeConfirmToken(
  token: string
): { subscriptionId: string; email: string } | null {
  const payload = verifyToken(
    token,
    deriveSecret(CONFIRM_DOMAIN),
    MAC_HEX_LENGTH_LEGACY
  );
  const parsed = payload ? parseColonPayload(payload) : null;
  if (!parsed || !parsed.second.includes('@')) return null;
  return { subscriptionId: parsed.first, email: parsed.second };
}

export function buildSubscribeConfirmUrl(
  subscriptionId: string,
  email: string
): string | null {
  const baseUrl = APP_URL.replace(/\/$/, '');
  return buildTokenUrl(
    baseUrl,
    '/api/notifications/confirm',
    generateSubscribeConfirmToken(subscriptionId, email)
  );
}
