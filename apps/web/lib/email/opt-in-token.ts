/**
 * Opt-In Token Utilities
 *
 * Generates and verifies HMAC-signed tokens for audience marketing opt-in links.
 * Prevents unauthenticated callers from opting arbitrary emails in or out.
 */

import { BASE_URL } from '@/constants/domains';
import { deriveSecret, signPayload, verifyToken } from './hmac-token';

const OPT_IN_DOMAIN = 'jovie:audience-opt-in-token-secret';

/**
 * Generate a signed opt-in token encoding email and profileId.
 * Token format: base64url(email:profileId).hmac
 */
export function generateOptInToken(
  email: string,
  profileId: string
): string | null {
  const secret = deriveSecret(OPT_IN_DOMAIN);
  const normalizedEmail = email.toLowerCase().trim();
  return signPayload(`${normalizedEmail}:${profileId}`, secret);
}

/**
 * Verify and decode an opt-in token.
 * Returns { email, profileId } if valid, null otherwise.
 */
export function verifyOptInToken(
  token: string
): { email: string; profileId: string } | null {
  const secret = deriveSecret(OPT_IN_DOMAIN);
  const payload = verifyToken(token, secret);
  if (!payload) return null;

  const colonIndex = payload.indexOf(':');
  if (colonIndex === -1) return null;

  const email = payload.slice(0, colonIndex);
  const profileId = payload.slice(colonIndex + 1);
  if (!email.includes('@') || !profileId) return null;

  return { email, profileId };
}

/**
 * Build a full opt-in URL with a signed token.
 * Returns null if RESEND_API_KEY is not configured.
 */
export function buildOptInUrl(email: string, profileId: string): string | null {
  const token = generateOptInToken(email, profileId);
  if (!token) {
    return null;
  }
  return `${BASE_URL}/api/audience/opt-in?token=${encodeURIComponent(token)}`;
}
