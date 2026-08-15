import 'server-only';

import { getRedis } from '@/lib/redis';

const PROBE_TTL_SECONDS = 60;

export type RedisFailureKind =
  | 'not_configured'
  | 'quota_exceeded'
  | 'read_after_write_mismatch'
  | 'unavailable';

export interface RedisOperabilityResult {
  status: 'healthy';
  latencyMs: number;
}

export class RedisOperabilityError extends Error {
  readonly kind: RedisFailureKind;

  constructor(kind: RedisFailureKind, cause?: unknown) {
    super(`Redis operability probe failed: ${kind}`, { cause });
    this.name = 'RedisOperabilityError';
    this.kind = kind;
  }
}

export function classifyRedisFailure(error: unknown): RedisFailureKind {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /max requests limit|quota exceeded|request limit exceeded/i.test(message)
  ) {
    return 'quota_exceeded';
  }
  return 'unavailable';
}

/**
 * Proves the operations Jovie actually needs, rather than treating PING as
 * service health. The short TTL makes cleanup automatic even if the read fails.
 */
export async function probeRedisOperability(): Promise<RedisOperabilityResult> {
  const redis = getRedis({ signal: AbortSignal.timeout(2_000) });
  if (!redis) {
    throw new RedisOperabilityError('not_configured');
  }

  const nonce = crypto.randomUUID();
  const key = `health:operability:${nonce}`;
  const start = Date.now();

  try {
    await redis.set(key, nonce, { ex: PROBE_TTL_SECONDS });
    const stored = await redis.get<string>(key);
    if (stored !== nonce) {
      throw new RedisOperabilityError('read_after_write_mismatch');
    }
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (error) {
    if (error instanceof RedisOperabilityError) throw error;
    throw new RedisOperabilityError(classifyRedisFailure(error), error);
  }
}
