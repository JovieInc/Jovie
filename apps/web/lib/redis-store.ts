/**
 * Chooses the Redis backend for rate limits and cache.
 *
 * Production (VERCEL_ENV=production, or NODE_ENV=production outside CI, E2E,
 * tests, and Vercel preview) keeps Upstash and fail-closed limiters.
 * Everywhere else uses an in-memory store, or local Redis when REDIS_URL
 * points at localhost. The production Upstash host is refused outside
 * production unless JOVIE_ALLOW_PRODUCTION_UPSTASH=1.
 */

export const PRODUCTION_UPSTASH_HOST = 'real-kiwi-157253.upstash.io';

export const ALLOW_PRODUCTION_UPSTASH_ENV = 'JOVIE_ALLOW_PRODUCTION_UPSTASH';

export type RedisStoreKind = 'upstash' | 'local-redis' | 'memory';

export interface RedisStoreEnv {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  CI?: string;
  E2E_TEST_MODE?: string;
  VITEST?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  REDIS_URL?: string;
  JOVIE_ALLOW_PRODUCTION_UPSTASH?: string;
}

export interface RedisStoreDecision {
  kind: RedisStoreKind;
  /** True when a non-production runtime was pointed at the production Upstash host. */
  blockProductionUpstash: boolean;
  warning?: string;
  localRedisUrl?: string;
}

type RedisStoreSource = RedisStoreEnv & Record<string, string | undefined>;

function flagEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export function isProductionUpstashHost(
  url: string | undefined | null
): boolean {
  if (!url) return false;
  try {
    return new URL(url.trim()).hostname === PRODUCTION_UPSTASH_HOST;
  } catch {
    return url.includes(PRODUCTION_UPSTASH_HOST);
  }
}

/**
 * REDIS_URL is local only for loopback. Remote URLs are ignored so a copied
 * production connection string cannot be selected by accident.
 */
export function isLocalRedisUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      return false;
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Production runtime keeps Upstash.
 *
 * VERCEL_ENV=production wins over CI and E2E flags so a leaked test switch
 * cannot move production onto an in-memory limiter.
 */
export function isProductionRedisRuntime(env: RedisStoreEnv): boolean {
  if (env.VERCEL_ENV === 'production') return true;
  if (env.NODE_ENV !== 'production') return false;
  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development') {
    return false;
  }
  if (flagEnabled(env.CI)) return false;
  if (flagEnabled(env.E2E_TEST_MODE)) return false;
  if (flagEnabled(env.VITEST)) return false;
  return true;
}

function localRedisLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.hostname}${port}`;
  } catch {
    return 'localhost';
  }
}

export function selectRedisStore(env: RedisStoreEnv): RedisStoreDecision {
  const localRedisUrl = isLocalRedisUrl(env.REDIS_URL)
    ? env.REDIS_URL.trim()
    : undefined;
  const prodHost = isProductionUpstashHost(env.UPSTASH_REDIS_REST_URL);
  const override = flagEnabled(env.JOVIE_ALLOW_PRODUCTION_UPSTASH);

  if (isProductionRedisRuntime(env)) {
    return { kind: 'upstash', blockProductionUpstash: false };
  }

  if (prodHost && override) {
    return {
      kind: 'upstash',
      blockProductionUpstash: false,
      warning: `[redis] ${ALLOW_PRODUCTION_UPSTASH_ENV} is set outside production. Using production Upstash host ${PRODUCTION_UPSTASH_HOST} for deliberate debugging.`,
    };
  }

  if (localRedisUrl) {
    return {
      kind: 'local-redis',
      blockProductionUpstash: prodHost,
      localRedisUrl,
      warning: prodHost
        ? `[redis] Refusing production Upstash host ${PRODUCTION_UPSTASH_HOST} outside production. Using local Redis at ${localRedisLabel(localRedisUrl)}. Set ${ALLOW_PRODUCTION_UPSTASH_ENV}=1 to override for deliberate production debugging.`
        : undefined,
    };
  }

  return {
    kind: 'memory',
    blockProductionUpstash: prodHost,
    warning: prodHost
      ? `[redis] Refusing production Upstash host ${PRODUCTION_UPSTASH_HOST} outside production. Using the in-memory rate limiter and cache. Set ${ALLOW_PRODUCTION_UPSTASH_ENV}=1 to override for deliberate production debugging.`
      : undefined,
  };
}

export function redisStoreEnvFrom(
  source: RedisStoreSource | RedisStoreEnv
): RedisStoreEnv {
  return {
    NODE_ENV: source.NODE_ENV,
    VERCEL_ENV: source.VERCEL_ENV,
    CI: source.CI,
    E2E_TEST_MODE: source.E2E_TEST_MODE,
    VITEST: source.VITEST,
    UPSTASH_REDIS_REST_URL: source.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: source.UPSTASH_REDIS_REST_TOKEN,
    REDIS_URL: source.REDIS_URL,
    JOVIE_ALLOW_PRODUCTION_UPSTASH: source.JOVIE_ALLOW_PRODUCTION_UPSTASH,
  };
}

let warned = false;

export function warnRedisStoreDecision(decision: RedisStoreDecision): void {
  if (!decision.warning || warned) return;
  warned = true;
  console.warn(decision.warning);
}

export function resetRedisStoreWarningForTests(): void {
  warned = false;
}

/**
 * Direct Upstash REST clients (seeders, E2E cleanup) must use this gate.
 * Non-production runtimes do not receive credentials, even when Doppler or
 * CI still injects the production URL.
 */
export function productionUpstashCredentials(
  source: RedisStoreSource = process.env
): { url: string; token: string } | null {
  const env = redisStoreEnvFrom(source);
  const decision = selectRedisStore(env);
  warnRedisStoreDecision(decision);
  if (decision.kind !== 'upstash') return null;
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}
