/**
 * RFC 8058 One-Click Unsubscribe Token
 *
 * Signs and verifies tokens for the List-Unsubscribe-Post header.
 * Token payload: subscriberId:email (HMAC-signed, base64url encoded).
 *
 * Used by release-day-notification.ts to generate per-email unsubscribe URLs,
 * and by /api/notifications/unsubscribe/one-click/route.ts to verify them.
 */

import { buildTokenUrl, createColonTokenFns } from './hmac-token';

const DOMAIN = 'one-click-unsubscribe-v1';

const { sign, verify } = createColonTokenFns({
  domain: DOMAIN,
  emailIndex: 1,
});

/**
 * Generate a signed one-click unsubscribe token for a subscriber.
 * @param subscriberId - The notification subscription ID (UUID)
 * @param email - The subscriber's email address
 * @returns Signed token string, or null if HMAC secret unavailable
 */
export function signOneClickUnsubscribeToken(
  subscriberId: string,
  email: string
): string | null {
  return sign(subscriberId, email);
}

/**
 * Verify and decode a one-click unsubscribe token.
 * @returns { subscriberId, email } if valid, null otherwise
 */
export function verifyOneClickUnsubscribeToken(
  token: string
): { subscriberId: string; email: string } | null {
  const result = verify(token);
  if (!result) return null;
  return { subscriberId: result.first, email: result.second };
}

/**
 * Build a full one-click unsubscribe URL for use in email headers.
 * @param baseUrl - The app's base URL (e.g., https://jov.ie)
 * @param subscriberId - The notification subscription ID
 * @param email - The subscriber's email
 * @returns Full URL with signed token, or null if signing fails
 */
export function buildOneClickUnsubscribeUrl(
  baseUrl: string,
  subscriberId: string,
  email: string
): string | null {
  const token = signOneClickUnsubscribeToken(subscriberId, email);
  return buildTokenUrl(
    baseUrl,
    '/api/notifications/unsubscribe/one-click',
    token
  );
}
