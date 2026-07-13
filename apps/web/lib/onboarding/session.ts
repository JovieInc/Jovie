import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env, isSecureEnv } from '@/lib/env-server';

/**
 * Anonymous onboarding session (JOV-2132).
 *
 * Pre-account visitors at /start receive a signed cookie containing a
 * sessionId UUID. The cookie value is `{sessionId}.{hmacSig}` where hmacSig
 * is HMAC-SHA256(SESSION_SECRET, sessionId) encoded as base64url. The signed
 * format guarantees an attacker cannot forge a sessionId they don't already
 * have — only the server can mint valid cookies.
 *
 * The sessionId is later written onto chat_conversations rows and claimed
 * onto the authenticated app user via /api/onboarding/claim after signup.
 */

const COOKIE_NAME = 'jovie_onboarding_session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OnboardingSessionOrigin = 'existing' | 'minted';

export interface OnboardingSessionResolution {
  readonly sessionId: string;
  readonly origin: OnboardingSessionOrigin;
}

function getSessionSecret(): string {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET is not configured (must be >= 32 chars). Required for onboarding chat anonymous sessions.'
    );
  }
  return secret;
}

function signSessionId(sessionId: string): string {
  return createHmac('sha256', getSessionSecret())
    .update(sessionId)
    .digest('base64url');
}

/** Build the wire cookie value: `{sessionId}.{signature}`. */
export function encodeSessionCookie(sessionId: string): string {
  return `${sessionId}.${signSessionId(sessionId)}`;
}

/**
 * Validate + extract sessionId from a cookie value. Returns null on:
 * - missing/empty input
 * - malformed shape (must be exactly `uuid.sig`)
 * - sessionId not a valid UUID
 * - signature mismatch (constant-time comparison)
 */
export function verifySessionCookie(
  cookieValue: string | undefined
): string | null {
  if (!cookieValue) return null;
  const firstDot = cookieValue.indexOf('.');
  if (firstDot <= 0 || firstDot === cookieValue.length - 1) return null;

  const sessionId = cookieValue.slice(0, firstDot);
  const providedSig = cookieValue.slice(firstDot + 1);

  if (!UUID_PATTERN.test(sessionId)) return null;

  const expectedSig = signSessionId(sessionId);
  const expectedBuf = Buffer.from(expectedSig);
  const providedBuf = Buffer.from(providedSig);
  if (expectedBuf.length !== providedBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, providedBuf)) return null;

  return sessionId;
}

/**
 * Read the current request's onboarding cookie and return the sessionId if
 * it is present and valid. Returns null if missing, malformed, or tampered.
 */
export async function getCurrentOnboardingSessionId(): Promise<string | null> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME);
  return verifySessionCookie(cookie?.value);
}

/**
 * Get the existing onboarding sessionId from the request cookies, or mint a
 * fresh one and write the signed cookie back to the response.
 *
 * Safe to call from any Server Component, Route Handler, or Server Action
 * that has access to `next/headers` cookies(). Idempotent within a request.
 */
export async function getOrMintOnboardingSessionId(): Promise<OnboardingSessionResolution> {
  const store = await cookies();
  const existing = verifySessionCookie(store.get(COOKIE_NAME)?.value);
  if (existing) {
    return { sessionId: existing, origin: 'existing' };
  }

  const sessionId = randomUUID();
  store.set(COOKIE_NAME, encodeSessionCookie(sessionId), {
    httpOnly: true,
    secure: isSecureEnv(),
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return { sessionId, origin: 'minted' };
}

/** Clear the onboarding session cookie (e.g. after successful claim). */
export async function clearOnboardingSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Exported for tests + claim endpoint. */
export const ONBOARDING_SESSION_COOKIE_NAME = COOKIE_NAME;
