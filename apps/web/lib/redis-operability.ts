import 'server-only';

import { closeRedisQuotaCircuit, getRedis } from '@/lib/redis';
import { isRedisQuotaFailure } from '@/lib/utils/errors';

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

function serializeRedisFailure(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function classifyRedisFailure(error: unknown): RedisFailureKind {
  if (isRedisQuotaFailure(error)) {
    return 'quota_exceeded';
  }
  const message = serializeRedisFailure(error);
  // captureWarning({ error: UpstashError }) JSON.stringifies to
  // {"error":{"name":"UpstashError"}} because message/stack are
  // non-enumerable. That payload is the quota cluster (JOV-5221).
  if (
    /\{\s*(?:"error"\s*:\s*\{\s*)?"name"\s*:\s*"UpstashError"/.test(message)
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
  const redis = getRedis({
    signal: AbortSignal.timeout(2_000),
    bypassQuotaCircuit: true,
  });
  if (!redis) {
    throw new RedisOperabilityError('not_configured');
  }

  const nonce = crypto.randomUUID();
  const key = `health:operability:${nonce}`;
  const start = Date.now();

  try {
    await redis.set(key, nonce, { ex: PROBE_TTL_SECONDS });
    const stored = await redis.getdel<string>(key);
    if (stored !== nonce) {
      throw new RedisOperabilityError('read_after_write_mismatch');
    }
    closeRedisQuotaCircuit();
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (error) {
    if (error instanceof RedisOperabilityError) throw error;
    throw new RedisOperabilityError(classifyRedisFailure(error), error);
  } finally {
    // GETDEL is the normal cleanup path. DEL is deliberately retained as a
    // bounded, idempotent cleanup/permission check when SET or GETDEL fails.
    await redis.del(key).catch(() => undefined);
  }
}
