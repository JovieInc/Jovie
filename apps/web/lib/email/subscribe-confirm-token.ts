/**
 * Subscribe Confirmation Token Utilities
 *
 * Generates and verifies HMAC-signed tokens for double opt-in email verification.
 */

import { BASE_URL } from '@/constants/app';
import { buildTokenUrl, createColonTokenFns } from './hmac-token';

const { sign, verify } = createColonTokenFns({
  domain: 'jovie:subscribe-confirm-token-secret',
  emailIndex: 1,
});

export function generateSubscribeConfirmToken(
  subscriptionId: string,
  email: string
): string | null {
  return sign(subscriptionId, email);
}

export function verifySubscribeConfirmToken(
  token: string
): { subscriptionId: string; email: string } | null {
  const result = verify(token);
  return result ? { subscriptionId: result.first, email: result.second } : null;
}

export function buildSubscribeConfirmUrl(
  subscriptionId: string,
  email: string
): string | null {
  const baseUrl = BASE_URL.replace(/\/$/, '');
  return buildTokenUrl(
    baseUrl,
    '/api/notifications/confirm',
    generateSubscribeConfirmToken(subscriptionId, email)
  );
}
