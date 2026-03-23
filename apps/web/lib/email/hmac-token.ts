/**
 * Shared HMAC Token Primitives
 *
 * Low-level sign/verify functions used by all email token modules
 * (opt-in, subscribe-confirm, unsubscribe). Each module provides its own
 * secret derivation and payload format; this module handles the crypto.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env-server';

/** Default HMAC tag length: 16 hex chars (8 bytes / 64 bits) for legacy compatibility. */
export const MAC_HEX_LENGTH_LEGACY = 16;
/** Recommended HMAC tag length: 32 hex chars (16 bytes / 128 bits). */
export const MAC_HEX_LENGTH = 32;

/**
 * Derive a domain-separated secret from RESEND_API_KEY.
 * Each token type passes a unique domain string to prevent cross-use.
 * Returns null if RESEND_API_KEY is not configured.
 */
export function deriveSecret(domain: string): string | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return createHmac('sha256', apiKey).update(domain).digest('hex').slice(0, 32);
}

/**
 * Legacy secret derivation using plain SHA-256 hash (no domain separation).
 * Used by the original unsubscribe token module — kept for backwards compatibility
 * with tokens already in circulation.
 */
export function deriveSecretLegacy(): string | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 32);
}

/**
 * Sign a payload string with HMAC-SHA256 and encode as base64url(payload).hmac
 * Returns null if secret is null.
 * @param macLength Hex chars for the HMAC tag (default: MAC_HEX_LENGTH for new tokens)
 */
export function signPayload(
  payload: string,
  secret: string | null,
  macLength: number = MAC_HEX_LENGTH
): string | null {
  if (!secret) return null;
  const hmac = createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
    .slice(0, macLength);
  const payloadBase64 = Buffer.from(payload).toString('base64url');
  return `${payloadBase64}.${hmac}`;
}

/**
 * Verify and decode a base64url(payload).hmac token.
 * Returns the decoded payload string if the HMAC is valid, null otherwise.
 * @param macLength Hex chars for the HMAC tag (default: MAC_HEX_LENGTH for new tokens)
 */
export function verifyToken(
  token: string,
  secret: string | null,
  macLength: number = MAC_HEX_LENGTH
): string | null {
  try {
    if (!secret) return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadBase64, providedHmac] = parts;
    if (!payloadBase64 || !providedHmac) return null;

    const payload = Buffer.from(payloadBase64, 'base64url').toString('utf8');

    const expectedHmac = createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
      .slice(0, macLength);

    const providedBuffer = Buffer.from(providedHmac, 'hex');
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
