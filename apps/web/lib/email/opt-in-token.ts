/**
 * Opt-In Token Utilities
 *
 * Generates and verifies HMAC-signed tokens for audience marketing opt-in links.
 * Prevents unauthenticated callers from opting arbitrary emails in or out.
 * Uses the same cryptographic pattern as unsubscribe and subscribe-confirm tokens.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { BASE_URL } from '@/constants/domains';
import { env } from '@/lib/env-server';

/**
 * Secret key for signing opt-in tokens.
 * Derived from RESEND_API_KEY with a distinct domain prefix to prevent cross-use.
 */
function getOptInSecret(): string | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return createHmac('sha256', apiKey)
    .update('jovie:audience-opt-in-token-secret')
    .digest('hex')
    .slice(0, 32);
}

/**
 * Generate a signed opt-in token encoding email and profileId.
 * Token format: base64url(email:profileId).hmac
 */
export function generateOptInToken(
  email: string,
  profileId: string
): string | null {
  const secret = getOptInSecret();
  if (!secret) {
    return null;
  }
  const normalizedEmail = email.toLowerCase().trim();
  const payload = `${normalizedEmail}:${profileId}`;
  const hmac = createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
    .slice(0, 16);
  const payloadBase64 = Buffer.from(payload).toString('base64url');
  return `${payloadBase64}.${hmac}`;
}

/**
 * Verify and decode an opt-in token.
 * Returns { email, profileId } if valid, null otherwise.
 */
export function verifyOptInToken(
  token: string
): { email: string; profileId: string } | null {
  try {
    const [payloadBase64, providedHmac] = token.split('.');
    if (!payloadBase64 || !providedHmac) return null;

    const payload = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const colonIndex = payload.indexOf(':');
    if (colonIndex === -1) return null;

    const email = payload.slice(0, colonIndex);
    const profileId = payload.slice(colonIndex + 1);
    if (!email.includes('@') || !profileId) return null;

    const secret = getOptInSecret();
    if (!secret) return null;

    const expectedHmac = createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
      .slice(0, 16);

    const providedBuffer = Buffer.from(providedHmac, 'hex');
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null;
    }

    return { email, profileId };
  } catch {
    return null;
  }
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
