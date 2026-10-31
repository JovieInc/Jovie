import 'server-only';
import { createHash } from 'node:crypto';
import { env } from '@/lib/env-server';
import { syntheticPassageTokenLimiter } from '@/lib/rate-limit/limiters';
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
 */

const JTI_KEY_PREFIX = 'synthetic-passage:jti:';

export interface SyntheticPassageGrant {
  readonly actorId: 'prodcert';
  readonly claims: PassageTokenClaims;
}

function subjectRef(sub: string): string {
  return createHash('sha256').update(sub).digest('hex').slice(0, 12);
}

/**
 * Emit a passage outcome to the logs production actually captures.
 *
 * The shared `logger` no-ops on production builds (lib/utils/logger.ts),
 * which left denial reasons invisible exactly when they matter: diagnosing a
 * prod cert red (`/api/chat` 403 `siteverify_failed`, JOV-9625) remotely,
 * from the requestId the 403 body already carries. When the dev/preview
 * logger is off, mirror the event to `console` so Vercel Runtime Logs carry
 * the reason. Payloads are audit fields only — scope, hashed subject, jti,
 * run id, requestId — never the token, the raw claims, or any secret value.
 */
function logPassageEvent(
  level: 'info' | 'warn',
  message: string,
  payload: Record<string, unknown>
): void {
  logger[level](message, payload);
  if (!logger.enabled) {
    (level === 'warn' ? console.warn : console.info)(message, payload);
  }
}

function passageKey(): Buffer | null {
  if (env.SYNTHETIC_PASSAGE_TOKENS_DISABLED === '1') return null;
  const root = env.CRON_SECRET;
  if (!root || root.length < 16) return null;
  return derivePassageKey(root);
}

export async function resolveSyntheticPassageToken(
  headers: Pick<Headers, 'get'>,
  scope: PassageTokenScope,
  options: { readonly consume: boolean; readonly requestId?: string }
): Promise<SyntheticPassageGrant | null> {
  const token = headers.get(PASSAGE_TOKEN_HEADER);
  if (!token) return null;
  const base = { scope, requestId: options.requestId };

  const key = passageKey();
  if (!key) {
    logPassageEvent('warn', '[synthetic-passage-token] denied: disabled', base);
    return null;
  }

  const verdict = verifyPassageToken(token, key, scope);
  if (!verdict.ok) {
    logPassageEvent('warn', '[synthetic-passage-token] denied', {
      ...base,
      reason: verdict.reason,
    });
    return null;
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
    return { actorId: 'prodcert', claims };
  }

  try {
    const rate = await syntheticPassageTokenLimiter.limit(scope);
    if (!rate.success) {
      logPassageEvent(
        'warn',
        '[synthetic-passage-token] denied: rate limit',
        audit
      );
      return null;
    }
    const redis = getRedis();
    if (!redis) {
      logPassageEvent(
        'warn',
        '[synthetic-passage-token] denied: no redis',
        audit
      );
      return null;
    }
    const ttl = Math.max(60, claims.exp - Math.floor(Date.now() / 1000) + 60);
    const claimed = await redis.set(`${JTI_KEY_PREFIX}${claims.jti}`, 1, {
      nx: true,
      ex: ttl,
    });
    if (claimed !== 'OK') {
      logPassageEvent(
        'warn',
        '[synthetic-passage-token] denied: replay',
        audit
      );
      return null;
    }
  } catch (error) {
    logPassageEvent('warn', '[synthetic-passage-token] denied: store error', {
      ...audit,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  logPassageEvent('info', '[synthetic-passage-token] granted', audit);
  return { actorId: 'prodcert', claims };
}
