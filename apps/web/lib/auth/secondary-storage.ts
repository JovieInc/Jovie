import 'server-only';

import type { SecondaryStorage } from 'better-auth';
import { env } from '@/lib/env';
import { captureError } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

/**
 * Better Auth secondary storage over the existing Upstash Redis client.
 *
 * Contract (docs/auth/better-auth-migration-plan.md, eng review rows 33-34):
 * - Every read returns a STRING (or null). The shared Upstash client uses
 *   `automaticDeserialization: true`, so `redis.get` may hand back parsed
 *   objects; passing those through would violate Better Auth's
 *   `SecondaryStorage` string contract and could mass-invalidate sessions.
 * - `get`/`set`/`increment` are best-effort: bounded by a 500ms timeout race,
 *   warn-and-degrade, never throw. Sessions stay durable in Postgres
 *   (`storeSessionInDatabase: true`), so Redis loss only costs latency.
 * - `delete` FAILS CLOSED: retried once, then throws. A swallowed delete
 *   would leave a revoked session readable from Redis until TTL — sign-out
 *   must fail visibly instead (security.md fail-closed persistence rule).
 * - In-memory Map fallback is used ONLY when Redis is unconfigured AND the
 *   deploy is not production (security.md bans in-memory public traffic
 *   controls in production).
 */

const DEFAULT_OP_TIMEOUT_MS = 500;
const MEMORY_FALLBACK_MAX_ENTRIES = 1000;

/**
 * Env-tunable so local dev (where Upstash REST RTT can sit at ~500ms and race
 * the default) can raise headroom without touching deployed behavior. Read at
 * call time to stay test-mutable, mirroring env-server's dynamic proxy.
 */
function getOpTimeoutMs(): number {
  const raw = env.AUTH_SECONDARY_STORAGE_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OP_TIMEOUT_MS;
}

class SecondaryStorageTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Secondary storage operation timed out after ${timeoutMs}ms`);
    this.name = 'SecondaryStorageTimeoutError';
  }
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  const timeoutMs = getOpTimeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new SecondaryStorageTimeoutError(timeoutMs)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Guard Upstash automaticDeserialization: always hand Better Auth strings. */
function toStringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isProductionDeploy(): boolean {
  return env.VERCEL_ENV === 'production';
}

// ---------------------------------------------------------------------------
// In-memory fallback (non-production only)
// ---------------------------------------------------------------------------

interface MemoryEntry {
  value: string;
  /** Epoch ms; null = no expiry. */
  expiresAt: number | null;
}

const memoryStore = new Map<string, MemoryEntry>();

function memoryGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  // Refresh recency so eviction approximates LRU.
  memoryStore.delete(key);
  memoryStore.set(key, entry);
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds?: number): void {
  if (
    !memoryStore.has(key) &&
    memoryStore.size >= MEMORY_FALLBACK_MAX_ENTRIES
  ) {
    const oldestKey = memoryStore.keys().next().value;
    if (oldestKey !== undefined) memoryStore.delete(oldestKey);
  }
  memoryStore.delete(key);
  memoryStore.set(key, {
    value,
    expiresAt:
      ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
  });
}

function memoryIncrement(key: string, ttlSeconds: number): number {
  const current = memoryGet(key);
  const count = current === null ? 1 : Number.parseInt(current, 10) + 1;
  if (current === null) {
    memorySet(key, String(count), ttlSeconds);
  } else {
    const entry = memoryStore.get(key);
    if (entry) entry.value = String(count);
  }
  return count;
}

/** Test-only: clear the non-production in-memory fallback store. */
export function resetSecondaryStorageMemoryForTests(): void {
  memoryStore.clear();
}

// ---------------------------------------------------------------------------
// Storage implementation
// ---------------------------------------------------------------------------

export const secondaryStorage: SecondaryStorage = {
  async get(key) {
    const redis = getRedis();
    if (!redis) {
      if (isProductionDeploy()) {
        logger.warn('[auth/secondary-storage] Redis unavailable, get degraded');
        return null;
      }
      return memoryGet(key);
    }
    try {
      return toStringValue(await withTimeout(redis.get(key)));
    } catch (error) {
      logger.warn('[auth/secondary-storage] get failed, degrading to null', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async set(key, value, ttl) {
    const redis = getRedis();
    if (!redis) {
      if (isProductionDeploy()) {
        logger.warn('[auth/secondary-storage] Redis unavailable, set skipped');
        return;
      }
      memorySet(key, value, ttl);
      return;
    }
    try {
      await withTimeout(
        ttl && ttl > 0
          ? redis.set(key, value, { ex: ttl })
          : redis.set(key, value)
      );
    } catch (error) {
      logger.warn('[auth/secondary-storage] set failed, skipped', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  /**
   * Atomic counter for Better Auth's secondary-storage rate limiter. TTL is
   * applied only when the key is created, per the 1.6.23 contract. Failures
   * degrade open (request allowed) consistent with get/set best-effort —
   * durable session revocation is the fail-closed path, not rate limiting.
   */
  async increment(key, ttl) {
    const redis = getRedis();
    if (!redis) {
      if (isProductionDeploy()) {
        logger.warn(
          '[auth/secondary-storage] Redis unavailable, increment degraded'
        );
        return 1;
      }
      return memoryIncrement(key, ttl);
    }
    try {
      const count = await withTimeout(redis.incr(key));
      if (ttl > 0) {
        // NX: set expiry only when the key has none. Covers both the fresh
        // key (count===1) and self-heals keys whose first expire call failed
        // — a TTL-less counter never resets and 429s that bucket forever.
        await withTimeout(redis.expire(key, ttl, 'NX'));
      }
      return count;
    } catch (error) {
      logger.warn('[auth/secondary-storage] increment failed, degrading', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 1;
    }
  },

  async delete(key) {
    const redis = getRedis();
    if (!redis) {
      if (!isProductionDeploy()) {
        memoryStore.delete(key);
        return;
      }
      const error = new Error(
        'Secondary storage delete failed closed: Redis unavailable in production'
      );
      await captureError(
        'Better Auth secondary storage delete unavailable',
        error,
        { operation: 'secondary-storage.delete' }
      );
      throw error;
    }
    try {
      await withTimeout(redis.del(key));
      return;
    } catch (firstError) {
      logger.warn('[auth/secondary-storage] delete failed, retrying once', {
        error:
          firstError instanceof Error ? firstError.message : String(firstError),
      });
    }
    try {
      await withTimeout(redis.del(key));
    } catch (secondError) {
      // Fail closed: a swallowed delete leaves revoked sessions readable
      // from Redis until TTL. Sign-out must fail loudly instead.
      await captureError(
        'Better Auth secondary storage delete failed after retry',
        secondError,
        { operation: 'secondary-storage.delete' }
      );
      throw new Error('Secondary storage delete failed closed after retry', {
        cause: secondError,
      });
    }
  },
};
