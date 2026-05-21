import 'server-only';
import crypto from 'node:crypto';
import { env } from '@/lib/env-server';

/** Maximum age of a Google OAuth state token before it's rejected (15 minutes). */
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

interface GoogleOAuthState {
  readonly userId: string;
  readonly returnTo: string;
  readonly ts: number;
}

function getStateSecret(): string {
  return (
    env.TRACKING_TOKEN_SECRET ??
    env.CRON_SECRET ??
    'dev-google-oauth-state-secret'
  );
}

/**
 * Signs and encodes a Google OAuth state token.
 * State is HMAC-SHA256-signed with base64url encoding to prevent CSRF.
 *
 * @param payload - User ID and post-auth redirect destination.
 * @returns Signed state string safe to use in the OAuth redirect URI.
 */
export function signGoogleOAuthState(
  payload: Omit<GoogleOAuthState, 'ts'>
): string {
  const state: GoogleOAuthState = { ...payload, ts: Date.now() };
  const data = Buffer.from(JSON.stringify(state)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getStateSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Verifies and decodes a Google OAuth state token.
 *
 * @throws If the state is malformed, signature invalid, or expired.
 */
export function verifyGoogleOAuthState(state: string): GoogleOAuthState {
  const dotIndex = state.lastIndexOf('.');
  if (dotIndex === -1) throw new Error('Invalid Google OAuth state format');

  const data = state.slice(0, dotIndex);
  const sig = state.slice(dotIndex + 1);

  if (!data || !sig) throw new Error('Invalid Google OAuth state format');

  const expected = crypto
    .createHmac('sha256', getStateSecret())
    .update(data)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error('Invalid Google OAuth state signature');
  }

  const parsed = JSON.parse(
    Buffer.from(data, 'base64url').toString('utf8')
  ) as GoogleOAuthState;

  if (Date.now() - parsed.ts > STATE_MAX_AGE_MS) {
    throw new Error('Google OAuth state expired');
  }

  return parsed;
}
