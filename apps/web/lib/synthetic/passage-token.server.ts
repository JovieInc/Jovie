import 'server-only';
import { createHash } from 'node:crypto';
import { env } from '@/lib/env-server';
import { syntheticPassageTokenLimiter } from '@/lib/rate-limit/limiters';
import { createRateLimiter } from '@/lib/rate-limit/rate-limiter';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';
import {
  derivePassageKey,
  PASSAGE_TOKEN_HEADER,
  type PassageTokenClaims,
  type PassageTokenScope,
  verifyPassageToken,
} from './passage-token';

/**
 * Server side of the canary passage token (see `passage-token.ts`).
 *
 * Fails closed at every step: no header, no root secret, the kill switch,
 * a bad token, a replayed jti, an exceeded or unavailable rate limit, or a
 * Redis error all return null, and the caller then verifies the real
 * Turnstile token exactly as for any visitor.
 *
 * `consume: false` is for /start rendering, which only picks the widget
 * sitekey. A test-mode widget grants nothing on its own: /api/chat
 * re-verifies and consumes the token before accepting a test-mode Turnstile
 * token.
 *
 * Every deny/grant site pairs the environment-gated `logger` call with a
 * raw `console` mirror of the same message and payload. The shared logger
 * no-ops on production builds (lib/utils/logger.ts), which left denial
 * reasons invisible exactly when they matter: diagnosing a prod cert red
 * (`/api/chat` 403 `siteverify_failed`, JOV-9625) remotely, from the
 * requestId the 403 body already carries. The mirror is what Vercel Runtime
 * Logs capture. Payloads are audit fields only — scope, hashed subject,
 * jti, run id, requestId — never the token, the raw claims, or any secret
 * value. Keep each mirror's message byte-identical to its logger call.
 */

const JTI_KEY_PREFIX = 'synthetic-passage:jti:';

/**
 * JOV-9826 canary-walk passage grants (`canary_reset` / `canary_checkout`),
 * separate from the visitor-facing `syntheticPassageTokenLimiter` (12/h in
 * `lib/rate-limit/limiters.ts`, sized when one cert run used one passage).
 * The claim-checkout walk draws two grants per green postdeploy run and one
 * per failed attempt, and the postdeploy cadence — main moves several times
 * an hour and every deploy re-runs the walk — drained the shared 12/h
 * window (postdeploy red 45350750159: the denial surfaced as the reset
 * route's opaque 401 `Valid canary passage token required` and read as auth
 * contract drift). 30/h covers the worst observed cadence (Nov 24
 * 04:46–04:59Z: five probe runs in 13 minutes ≈ 15 grants/h red, ≈ 12/h
 * green) with margin. Route-local instance per the canary-reset route's own
 * limiter pattern; every other passage gate (signature, scope, identity,
 * single-use jti, kill switch) still runs.
 */
const syntheticCanaryWalkPassageLimiter = createRateLimiter(
  {
    name: 'Synthetic Canary Walk Passage Token',
    limit: 30,
    window: '1 h',
    prefix: 'synthetic_passage_canary_walk',
    requireRedis: true,
    analytics: false,
    algorithm: 'fixed-window',
    trafficClass: 'internal',
  },
  { requireRedis: true }
);

/** The walk scopes get their own grant budget; visitor scopes keep the
 * shared 12/h `/start` budget. Keyed per scope either way, as before. */
function passageLimiterFor(scope: PassageTokenScope) {
  return scope === 'canary_reset' || scope === 'canary_checkout'
    ? syntheticCanaryWalkPassageLimiter
    : syntheticPassageTokenLimiter;
}

export interface SyntheticPassageGrant {
  readonly actorId: 'prodcert';
  readonly claims: PassageTokenClaims;
}

/** Why a passage resolution denied, for callers that name the class (JOV-9826). */
export type SyntheticPassageDenyCause =
  | 'no_token'
  | 'disabled'
  | 'invalid_token'
  | 'rate_limited'
  | 'store_error';

/** Grant plus deny cause: exactly one is non-null on a given resolution. */
export interface SyntheticPassageResolution {
  readonly grant: SyntheticPassageGrant | null;
  readonly denyCause: SyntheticPassageDenyCause | null;
}

function subjectRef(sub: string): string {
  return createHash('sha256').update(sub).digest('hex').slice(0, 12);
}

function passageKey(): Buffer | null {
  if (env.SYNTHETIC_PASSAGE_TOKENS_DISABLED === '1') return null;
  const root = env.CRON_SECRET;
  if (!root || root.length < 16) return null;
  return derivePassageKey(root);
}

/**
 * Resolve and (optionally) consume a passage token, naming the deny cause
 * (JOV-9826). Same fail-closed steps and byte-identical log lines as the
 * legacy wrapper below; only the return shape differs, so internal callers
 * can tell a shared-budget exhaustion (a named 429 condition) from a bad
 * token (a real 401) instead of guessing from an opaque null.
 */
export async function resolveSyntheticPassageTokenDetailed(
  headers: Pick<Headers, 'get'>,
  scope: PassageTokenScope,
  options: { readonly consume: boolean; readonly requestId?: string }
): Promise<SyntheticPassageResolution> {
  const token = headers.get(PASSAGE_TOKEN_HEADER);
  if (!token) return { grant: null, denyCause: 'no_token' };
  const base = { scope, requestId: options.requestId };

  const key = passageKey();
  if (!key) {
    logger.warn('[synthetic-passage-token] denied: disabled', base);
    if (!logger.enabled)
      console.warn('[synthetic-passage-token] denied: disabled', base);
    return { grant: null, denyCause: 'disabled' };
  }

  const verdict = verifyPassageToken(token, key, scope);
  if (!verdict.ok) {
    logger.warn('[synthetic-passage-token] denied', {
      ...base,
      reason: verdict.reason,
    });
    if (!logger.enabled)
      console.warn('[synthetic-passage-token] denied', {
        ...base,
        reason: verdict.reason,
      });
    return { grant: null, denyCause: 'invalid_token' };
  }
  const { claims } = verdict;
  const audit = {
    ...base,
    jti: claims.jti,
    run: claims.run,
    subjectRef: subjectRef(claims.sub),
    internal: true,
  };

  if (!options.consume) {
    return { grant: { actorId: 'prodcert', claims }, denyCause: null };
  }

  try {
    const rate = await passageLimiterFor(scope).limit(scope);
    if (!rate.success) {
      logger.warn('[synthetic-passage-token] denied: rate limit', audit);
      if (!logger.enabled)
        console.warn('[synthetic-passage-token] denied: rate limit', audit);
      return { grant: null, denyCause: 'rate_limited' };
    }
    const redis = getRedis();
    if (!redis) {
      logger.warn('[synthetic-passage-token] denied: no redis', audit);
      if (!logger.enabled)
        console.warn('[synthetic-passage-token] denied: no redis', audit);
      return { grant: null, denyCause: 'store_error' };
    }
    const ttl = Math.max(60, claims.exp - Math.floor(Date.now() / 1000) + 60);
    const claimed = await redis.set(`${JTI_KEY_PREFIX}${claims.jti}`, 1, {
      nx: true,
      ex: ttl,
    });
    if (claimed !== 'OK') {
      logger.warn('[synthetic-passage-token] denied: replay', audit);
      if (!logger.enabled)
        console.warn('[synthetic-passage-token] denied: replay', audit);
      return { grant: null, denyCause: 'invalid_token' };
    }
  } catch (error) {
    logger.warn('[synthetic-passage-token] denied: store error', {
      ...audit,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!logger.enabled)
      console.warn('[synthetic-passage-token] denied: store error', {
        ...audit,
        error: error instanceof Error ? error.message : String(error),
      });
    return { grant: null, denyCause: 'store_error' };
  }

  logger.info('[synthetic-passage-token] granted', audit);
  if (!logger.enabled) console.info('[synthetic-passage-token] granted', audit);
  return { grant: { actorId: 'prodcert', claims }, denyCause: null };
}

export async function resolveSyntheticPassageToken(
  headers: Pick<Headers, 'get'>,
  scope: PassageTokenScope,
  options: { readonly consume: boolean; readonly requestId?: string }
): Promise<SyntheticPassageGrant | null> {
  const { grant } = await resolveSyntheticPassageTokenDetailed(
    headers,
    scope,
    options
  );
  return grant;
}
