/**
 * Subscribe Confirmation Token Utilities
 *
 * Generates and verifies HMAC-signed tokens for double opt-in email verification.
 * Uses the same cryptographic pattern as unsubscribe tokens.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { APP_URL } from '@/constants/app';
import { env } from '@/lib/env-server';

/**
 * Secret key for signing subscribe confirmation tokens.
 * Derived from RESEND_API_KEY with a distinct prefix to avoid token cross-use.
 */
function getConfirmSecret(): string | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return createHash('sha256')
    .update(`subscribe-confirm:${apiKey}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Generate a subscribe confirmation token encoding the subscription ID and email.
 * Token format: base64url(subscriptionId:email).hmac
 */
export function generateSubscribeConfirmToken(
  subscriptionId: string,
  email: string
): string | null {
  const secret = getConfirmSecret();
  if (!secret) {
    return null;
  }
  const normalizedEmail = email.toLowerCase().trim();
  const payload = `${subscriptionId}:${normalizedEmail}`;
  const hmac = createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
    .slice(0, 16);
  const payloadBase64 = Buffer.from(payload).toString('base64url');
  return `${payloadBase64}.${hmac}`;
}

/**
 * Verify and decode a subscribe confirmation token.
 * Returns { subscriptionId, email } if valid, null otherwise.
 */
export function verifySubscribeConfirmToken(
  token: string
): { subscriptionId: string; email: string } | null {
  try {
    const [payloadBase64, providedHmac] = token.split('.');
    if (!payloadBase64 || !providedHmac) return null;

    const payload = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const colonIndex = payload.indexOf(':');
    if (colonIndex === -1) return null;

    const subscriptionId = payload.slice(0, colonIndex);
    const email = payload.slice(colonIndex + 1);
    if (!subscriptionId || !email.includes('@')) return null;

    const secret = getConfirmSecret();
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

    return { subscriptionId, email };
  } catch {
    return null;
  }
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
