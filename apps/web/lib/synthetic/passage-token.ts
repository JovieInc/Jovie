import {
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { isProdcertCanaryEmail } from './prodcert-identities';

/**
 * Canary passage token for the anonymous /start bot check (JOV-9625).
 *
 * Headless production certification cannot solve the real Turnstile
 * challenge, and an anonymous /start visit has no session for the
 * identity-bound passage in `passage.server.ts` to inspect. This token closes
 * that gap without weakening the check for anyone else:
 *
 *   - minted in CI from a key derived (HKDF, own label) from CRON_SECRET, so
 *     holding it already implies stronger production authority;
 *   - bound to one canary address (`prodcert-identities.ts`) and one scope;
 *   - lives at most {@link PASSAGE_TOKEN_MAX_TTL_SECONDS};
 *   - single use (jti consumed in Redis) and rate limited server-side;
 *   - its only effect is that the server verifies the Turnstile token in
 *     Cloudflare's official test mode (onboarding_chat) or tags a smartlink
 *     click synthetic so it stays out of customer analytics
 *     (smartlink_click). Every other gate and rate limit still runs, and
 *     every use is logged.
 *
 * Wire format: `jsp1.<base64url(JSON claims)>.<base64url(HMAC-SHA256)>`.
 */

export const PASSAGE_TOKEN_HEADER = 'x-jovie-synthetic-passage';
export const PASSAGE_TOKEN_PREFIX = 'jsp1';
export const PASSAGE_TOKEN_MAX_TTL_SECONDS = 600;
export const PASSAGE_TOKEN_MAX_LENGTH = 1024;
const MAX_CLOCK_SKEW_SECONDS = 30;
const KEY_INFO = 'jovie.synthetic-passage/v1';
const KEY_SALT = 'jovie-synthetic-passage';

export const PASSAGE_TOKEN_SCOPES = [
  'onboarding_chat',
  'smartlink_click',
] as const;
export type PassageTokenScope = (typeof PASSAGE_TOKEN_SCOPES)[number];

export interface PassageTokenClaims {
  /** Canary email the run acts as. */
  readonly sub: string;
  readonly scp: PassageTokenScope;
  /** Seconds since epoch. */
  readonly iat: number;
  readonly exp: number;
  /** Single-use id. */
  readonly jti: string;
  /** CI run identifier, for the audit log. */
  readonly run: string;
}

export type PassageTokenVerdict =
  | { readonly ok: true; readonly claims: PassageTokenClaims }
  | { readonly ok: false; readonly reason: PassageTokenDenyReason };

export type PassageTokenDenyReason =
  | 'malformed'
  | 'bad_signature'
  | 'expired'
  | 'not_yet_valid'
  | 'ttl_too_long'
  | 'wrong_scope'
  | 'not_canary';

const JTI_PATTERN = /^[A-Za-z0-9_-]{16,64}$/u;
const RUN_PATTERN = /^[A-Za-z0-9._-]{1,64}$/u;

/** 32-byte HMAC key, domain-separated from every other CRON_SECRET use. */
export function derivePassageKey(rootSecret: string): Buffer {
  if (!rootSecret || rootSecret.length < 16) {
    throw new Error('Passage key root secret is missing or too short.');
  }
  return Buffer.from(hkdfSync('sha256', rootSecret, KEY_SALT, KEY_INFO, 32));
}

function sign(key: Buffer, body: string): Buffer {
  return createHmac('sha256', key)
    .update(`${PASSAGE_TOKEN_PREFIX}.${body}`)
    .digest();
}

export function mintPassageToken(
  key: Buffer,
  input: {
    readonly sub: string;
    readonly scp: PassageTokenScope;
    readonly run: string;
    readonly ttlSeconds?: number;
    readonly nowSeconds?: number;
  }
): string {
  const iat = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 300;
  if (ttl <= 0 || ttl > PASSAGE_TOKEN_MAX_TTL_SECONDS) {
    throw new Error('Passage token TTL is out of range.');
  }
  if (!isProdcertCanaryEmail(input.sub)) {
    throw new Error('Passage tokens can only be minted for canary identities.');
  }
  const claims: PassageTokenClaims = {
    sub: input.sub.trim().toLowerCase(),
    scp: input.scp,
    iat,
    exp: iat + ttl,
    jti: randomBytes(18).toString('base64url'),
    run: input.run,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${PASSAGE_TOKEN_PREFIX}.${body}.${sign(key, body).toString('base64url')}`;
}

function parseClaims(body: string): PassageTokenClaims | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const c = value as Record<string, unknown>;
  if (
    typeof c.sub !== 'string' ||
    typeof c.scp !== 'string' ||
    !Number.isInteger(c.iat) ||
    !Number.isInteger(c.exp) ||
    typeof c.jti !== 'string' ||
    !JTI_PATTERN.test(c.jti) ||
    typeof c.run !== 'string' ||
    !RUN_PATTERN.test(c.run)
  ) {
    return null;
  }
  return c as unknown as PassageTokenClaims;
}

/**
 * Verify signature, lifetime, scope and canary binding. Stateless: the
 * caller consumes the jti and applies the rate limit.
 */
export function verifyPassageToken(
  token: string | null | undefined,
  key: Buffer,
  scope: PassageTokenScope,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): PassageTokenVerdict {
  const deny = (reason: PassageTokenDenyReason): PassageTokenVerdict => ({
    ok: false,
    reason,
  });
  if (!token || token.length > PASSAGE_TOKEN_MAX_LENGTH) {
    return deny('malformed');
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PASSAGE_TOKEN_PREFIX) {
    return deny('malformed');
  }
  const [, body, signature] = parts;
  if (!body || !signature) return deny('malformed');

  const expected = sign(key, body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return deny('bad_signature');
  }

  const claims = parseClaims(body);
  if (!claims) return deny('malformed');
  if (claims.exp - claims.iat > PASSAGE_TOKEN_MAX_TTL_SECONDS) {
    return deny('ttl_too_long');
  }
  if (claims.iat > nowSeconds + MAX_CLOCK_SKEW_SECONDS) {
    return deny('not_yet_valid');
  }
  if (nowSeconds >= claims.exp) return deny('expired');
  if (claims.scp !== scope) return deny('wrong_scope');
  if (!isProdcertCanaryEmail(claims.sub)) return deny('not_canary');
  return { ok: true, claims };
}
