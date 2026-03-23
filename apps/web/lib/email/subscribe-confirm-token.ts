/**
 * Subscribe Confirmation Token Utilities
 *
 * Generates and verifies HMAC-signed tokens for double opt-in email verification.
 */

import { APP_URL } from '@/constants/app';
import {
  deriveSecret,
  MAC_HEX_LENGTH_LEGACY,
  signPayload,
  verifyToken,
} from './hmac-token';

const CONFIRM_DOMAIN = 'jovie:subscribe-confirm-token-secret';

/**
 * Generate a subscribe confirmation token encoding the subscription ID and email.
 * Token format: base64url(subscriptionId:email).hmac
 */
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

/**
 * Verify and decode a subscribe confirmation token.
 * Returns { subscriptionId, email } if valid, null otherwise.
 */
export function verifySubscribeConfirmToken(
  token: string
): { subscriptionId: string; email: string } | null {
  const secret = deriveSecret(CONFIRM_DOMAIN);
  const payload = verifyToken(token, secret, MAC_HEX_LENGTH_LEGACY);
  if (!payload) return null;

  const colonIndex = payload.indexOf(':');
  if (colonIndex === -1) return null;

  const subscriptionId = payload.slice(0, colonIndex);
  const email = payload.slice(colonIndex + 1);
  if (!subscriptionId || !email.includes('@')) return null;

  return { subscriptionId, email };
}

/**
 * Build the full confirmation URL for subscribe verification emails.
 */
export function buildSubscribeConfirmUrl(
  subscriptionId: string,
  email: string
): string | null {
  const token = generateSubscribeConfirmToken(subscriptionId, email);
  if (!token) {
    return null;
  }
  const baseUrl = APP_URL.replace(/\/$/, '');
  return `${baseUrl}/api/notifications/confirm?token=${encodeURIComponent(token)}`;
}
