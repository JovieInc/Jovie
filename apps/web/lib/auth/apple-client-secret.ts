import 'server-only';

import { createPrivateKey, sign } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Apple "client secret" minting for Sign in with Apple.
 *
 * Verified against better-auth@1.6.23: the apple social provider consumes a
 * pre-signed ES256 JWT as `clientSecret` (core/social-providers/apple —
 * `options.clientSecret` goes straight to the token endpoint); it does NOT
 * mint the JWT from team/key/private-key env vars. So we own the JWT
 * (plan amendment row 30).
 *
 * Implementation note: the plan suggested jose, but jose signing is
 * async-only and `betterAuth()` needs the secret as a plain string at
 * config-construction time. `node:crypto`'s sync `sign()` with
 * `dsaEncoding: 'ieee-p1363'` produces the exact ES256 JWS signature format,
 * with zero new dependencies. Unit tests cross-verify the output with jose.
 *
 * Lifecycle: memoized module-level singleton, exp ≈ now + 150 days (Apple
 * caps at 180). Serverless instances re-mint on cold start; a long-lived
 * process re-mints when less than 30 days of validity remain. The <30-day
 * canary watchdog ships in the CI/canary commit of this migration.
 */

const APPLE_AUDIENCE = 'https://appleid.apple.com';
export const APPLE_CLIENT_SECRET_TTL_SECONDS = 150 * 24 * 60 * 60;
const REMINT_THRESHOLD_SECONDS = 30 * 24 * 60 * 60;

let cached: { jwt: string; exp: number } | null = null;

function base64UrlEncodeJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Doppler stores the .p8 with literal `\n` sequences; restore real newlines. */
function normalizePrivateKeyPem(raw: string): string {
  return raw.includes('\\n') ? raw.replaceAll('\\n', '\n') : raw;
}

export function generateAppleClientSecret(): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - nowSeconds > REMINT_THRESHOLD_SECONDS) {
    return cached.jwt;
  }

  const teamId = env.AUTH_APPLE_TEAM_ID;
  const clientId = env.AUTH_APPLE_CLIENT_ID;
  const keyId = env.AUTH_APPLE_KEY_ID;
  const privateKeyRaw = env.AUTH_APPLE_PRIVATE_KEY;
  if (!teamId || !clientId || !keyId || !privateKeyRaw) {
    throw new Error(
      'Apple client secret requires AUTH_APPLE_TEAM_ID, AUTH_APPLE_CLIENT_ID, ' +
        'AUTH_APPLE_KEY_ID and AUTH_APPLE_PRIVATE_KEY. Add them to Doppler ' +
        '(jovie-web) or omit all AUTH_APPLE_* vars to disable Apple sign-in.'
    );
  }

  const exp = nowSeconds + APPLE_CLIENT_SECRET_TTL_SECONDS;
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: teamId,
    iat: nowSeconds,
    exp,
    aud: APPLE_AUDIENCE,
    sub: clientId,
  };
  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
  const key = createPrivateKey(normalizePrivateKeyPem(privateKeyRaw));
  const signature = sign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');

  const jwt = `${signingInput}.${signature}`;
  cached = { jwt, exp };
  return jwt;
}

/** Test-only: drop the memoized client secret. */
export function resetAppleClientSecretCacheForTests(): void {
  cached = null;
}
