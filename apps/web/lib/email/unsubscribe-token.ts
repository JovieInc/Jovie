/**
 * Unsubscribe Token Utilities
 *
 * Functions for generating and verifying unsubscribe tokens for email templates.
 * Uses legacy (non-domain-separated) secret derivation for backwards compatibility
 * with tokens already in circulation.
 */

import { BASE_URL } from '@/constants/domains';
import {
  buildTokenUrl,
  deriveSecretLegacy,
  MAC_HEX_LENGTH_LEGACY,
  signPayload,
  verifyToken,
} from './hmac-token';

export function generateUnsubscribeToken(email: string): string | null {
  const normalizedEmail = email.toLowerCase().trim();
  return signPayload(
    normalizedEmail,
    deriveSecretLegacy(),
    MAC_HEX_LENGTH_LEGACY
  );
}

export function verifyUnsubscribeToken(token: string): string | null {
  const payload = verifyToken(
    token,
    deriveSecretLegacy(),
    MAC_HEX_LENGTH_LEGACY
  );
  if (!payload?.includes('@')) return null;
  return payload;
}

export function buildClaimInviteUnsubscribeUrl(email: string): string | null {
  return buildTokenUrl(
    BASE_URL,
    '/api/unsubscribe/claim-invites',
    generateUnsubscribeToken(email)
  );
}
