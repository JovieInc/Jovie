/**
 * Subscription Management Token
 *
 * Capability token issued when a subscriber proves mailbox control via the
 * email OTP flow. Required to escalate notification scope through
 * PATCH /api/notifications/preferences (enabling a disabled category or
 * opting in to artist emails). Opt-outs remain token-free so unsubscribe
 * semantics stay one-click.
 *
 * Uses the shared domain-separated HMAC machinery from lib/email/hmac-token.
 */

import {
  deriveSecret,
  MAC_HEX_LENGTH,
  signPayload,
  verifyToken,
} from '@/lib/email/hmac-token';

const TOKEN_DOMAIN = 'jovie:subscription-management:v1';

/** Cookie carrying the token between OTP verify and preferences PATCH. */
export const SUBSCRIPTION_MANAGEMENT_COOKIE = 'jv_sub_mgmt';

/** How long a verified session may escalate notification scope. */
export const SUBSCRIPTION_MANAGEMENT_TTL_MS = 60 * 60 * 1000;
export const SUBSCRIPTION_MANAGEMENT_TTL_SECONDS =
  SUBSCRIPTION_MANAGEMENT_TTL_MS / 1000;

/**
 * Issue a token bound to (artistId, email) with an expiry timestamp.
 * Returns null when the signing secret is unavailable (fail closed).
 */
export function generateSubscriptionManagementToken(
  artistId: string,
  email: string
): string | null {
  const expiresAt = Date.now() + SUBSCRIPTION_MANAGEMENT_TTL_MS;
  return signPayload(
    `${artistId}:${email}:${expiresAt}`,
    deriveSecret(TOKEN_DOMAIN),
    MAC_HEX_LENGTH
  );
}

/**
 * Verify a token was issued for exactly (artistId, email) and is unexpired.
 * Returns false on any mismatch or malformed payload.
 */
export function verifySubscriptionManagementToken(
  token: string | null | undefined,
  artistId: string,
  email: string
): boolean {
  if (!token) return false;
  const payload = verifyToken(
    token,
    deriveSecret(TOKEN_DOMAIN),
    MAC_HEX_LENGTH
  );
  if (!payload) return false;

  const firstColon = payload.indexOf(':');
  const lastColon = payload.lastIndexOf(':');
  if (firstColon === -1 || lastColon === -1 || firstColon === lastColon) {
    return false;
  }

  const tokenArtistId = payload.slice(0, firstColon);
  const tokenEmail = payload.slice(firstColon + 1, lastColon);
  const expiresAt = Number(payload.slice(lastColon + 1));

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  return tokenArtistId === artistId && tokenEmail === email;
}
