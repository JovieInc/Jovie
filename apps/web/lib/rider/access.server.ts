import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, isTestEnv } from '@/lib/env-server';
import {
  hashLibrarySharePassphrase,
  verifyLibrarySharePassphrase,
} from '@/lib/library-share/passphrase';

export const RIDER_LINK_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RIDER_ACCESS_COOKIE_TTL_MS = 30 * 60 * 1000;
export const RIDER_ACCESS_COOKIE_PREFIX = 'jovie_rider_';

export const hashRiderPassword = hashLibrarySharePassphrase;
export const verifyRiderPassword = verifyLibrarySharePassphrase;

function getSigningKey(): string | undefined {
  const key = env.URL_ENCRYPTION_KEY ?? env.BETTER_AUTH_SECRET;
  if (key) return key;
  // No secrets configured in tests → fixed key; prod fails closed.
  return isTestEnv() ? 'rider-signing-test-key' : undefined;
}

/** Shared `sig.expiresAt` envelope for link tokens and unlock cookies. */
function signEnvelope(
  scope: string,
  profileId: string,
  ttlMs: number
): string | null {
  const key = getSigningKey();
  if (!key) return null;
  const expiresAt = Date.now() + ttlMs;
  const sig = createHmac('sha256', key)
    .update(`${scope}:${profileId}:${expiresAt}`)
    .digest('hex');
  return `${sig}.${expiresAt}`;
}

function verifyEnvelope(
  scope: string,
  profileId: string,
  token: string | null | undefined
): boolean {
  const key = getSigningKey();
  if (!key || !token) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expiresAt = Number(token.substring(dot + 1));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = createHmac('sha256', key)
    .update(`${scope}:${profileId}:${expiresAt}`)
    .digest('hex');
  try {
    return timingSafeEqual(
      Buffer.from(token.substring(0, dot), 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export const createRiderLinkToken = (profileId: string) =>
  signEnvelope('rider-link', profileId, RIDER_LINK_TOKEN_TTL_MS);

export const verifyRiderLinkToken = (
  profileId: string,
  token: string | null | undefined
) => verifyEnvelope('rider-link', profileId, token);

export const riderAccessCookieName = (profileId: string) =>
  `${RIDER_ACCESS_COOKIE_PREFIX}${profileId}`;

export const createRiderAccessCookieValue = (profileId: string) =>
  signEnvelope('rider-access', profileId, RIDER_ACCESS_COOKIE_TTL_MS);

export const verifyRiderAccessCookieValue = (
  profileId: string,
  value: string | null | undefined
) => verifyEnvelope('rider-access', profileId, value);
