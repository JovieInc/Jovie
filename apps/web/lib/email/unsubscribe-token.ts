/**
 * Unsubscribe Token Utilities
 *
 * Functions for generating and verifying unsubscribe tokens for email templates.
 * Uses legacy (non-domain-separated) secret derivation for backwards compatibility
 * with tokens already in circulation.
 */

import { BASE_URL } from '@/constants/domains';
import { deriveSecretLegacy, signPayload, verifyToken } from './hmac-token';

/**
 * Generate an unsubscribe token for an email address.
 * Token = base64url(email).hmac(email)
 * Returns null if RESEND_API_KEY is not configured.
 */
export function generateUnsubscribeToken(email: string): string | null {
  const secret = deriveSecretLegacy();
  const normalizedEmail = email.toLowerCase().trim();
  return signPayload(normalizedEmail, secret);
}

/**
 * Verify and decode an unsubscribe token.
 * Returns the email address if valid, null otherwise.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const secret = deriveSecretLegacy();
  const payload = verifyToken(token, secret);
  if (!payload) return null;
  if (!payload.includes('@')) return null;
  return payload;
}

/**
 * Build a full unsubscribe URL for claim invite emails.
 * Returns null if RESEND_API_KEY is not configured.
 */
export function buildClaimInviteUnsubscribeUrl(email: string): string | null {
  const token = generateUnsubscribeToken(email);
  if (!token) {
    return null;
  }
  return `${BASE_URL}/api/unsubscribe/claim-invites?token=${encodeURIComponent(token)}`;
}
