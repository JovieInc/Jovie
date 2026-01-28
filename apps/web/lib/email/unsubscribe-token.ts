/**
 * Unsubscribe Token Utilities
 *
 * Functions for generating and verifying unsubscribe tokens for email templates.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { APP_URL } from '@/constants/domains';
import { env } from '@/lib/env';

/**
 * Secret key for signing unsubscribe tokens.
 * Derived from the RESEND_API_KEY to avoid adding a new env variable.
 * Returns null if RESEND_API_KEY is not set.
 */
function getUnsubscribeSecret(): string | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 32);
}

/**
 * Generate an unsubscribe token for an email address.
 * Token = base64url(email).hmac(email)
 * Returns null if RESEND_API_KEY is not configured.
 */
export function generateUnsubscribeToken(email: string): string | null {
  const secret = getUnsubscribeSecret();
  if (!secret) {
    return null;
  }
  const normalizedEmail = email.toLowerCase().trim();
  const hmac = createHmac('sha256', secret)
    .update(normalizedEmail)
    .digest('hex')
    .slice(0, 16);
  const emailBase64 = Buffer.from(normalizedEmail).toString('base64url');
  return `${emailBase64}.${hmac}`;
}

/**
 * Verify and decode an unsubscribe token.
 * Returns the email address if valid, null otherwise.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const [emailBase64, providedHmac] = token.split('.');
    if (!emailBase64 || !providedHmac) return null;

    const email = Buffer.from(emailBase64, 'base64url').toString('utf8');
    if (!email.includes('@')) return null;

    const secret = getUnsubscribeSecret();
    if (!secret) return null;

    const expectedHmac = createHmac('sha256', secret)
      .update(email)
      .digest('hex')
      .slice(0, 16);

    // Use timing-safe comparison to prevent timing attacks
    const providedBuffer = Buffer.from(providedHmac, 'hex');
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null;
    }

    return email;
  } catch {
    return null;
  }
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
  return `${APP_URL}/api/unsubscribe/claim-invites?token=${encodeURIComponent(token)}`;
}
