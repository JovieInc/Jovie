/**
 * Idempotency Utilities
 *
 * Provides distributed locking and idempotency for critical operations
 * to prevent duplicate processing of the same request.
 *
 * Uses Redis for distributed locking when available, with a local fallback
 * for development environments.
 *
 * @example
 * ```typescript
 * const result = await withIdempotency(
 *   `claim:${userId}:${spotifyArtistId}`,
 *   30, // 30 second lock
 *   async () => {
 *     return claimArtistProfile(userId, spotifyArtistId, handle);
 *   }
 * );
 * ```
 */

import { getRedis } from '@/lib/redis';

// ============================================================================
// Types
// ============================================================================

export interface IdempotencyResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  locked?: boolean;
}

export class IdempotencyError extends Error {
  constructor(
    message: string,
    public readonly key: string
  ) {
    super(message);
    this.name = 'IdempotencyError';
  }
}

// ============================================================================
// In-Memory Fallback Store
// ============================================================================

const memoryLocks = new Map<string, number>();
const MEMORY_CLEANUP_INTERVAL = 60_000; // 1 minute

/**
 * Clean up expired memory locks
 */
function cleanupMemoryLocks(): void {
  const now = Date.now();
  for (const [key, expiresAt] of memoryLocks.entries()) {
    if (now >= expiresAt) {
      memoryLocks.delete(key);
    }
  }
}

// Run cleanup periodically
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupMemoryLocks, MEMORY_CLEANUP_INTERVAL);
}

// ============================================================================
// Lock Operations
// ============================================================================

/**
 * Acquire an idempotency lock.
 *
 * @param key - Unique key for the operation
 * @param ttlSeconds - Lock TTL in seconds
 * @returns true if lock acquired, false if already locked
 */
async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  const lockKey = `idempotency:${key}`;
  const redis = getRedis();

  if (redis) {
    // Use Redis NX (set if not exists) with expiry
    const result = await redis.set(lockKey, '1', {
      nx: true,
      ex: ttlSeconds,
    });
    return result === 'OK';
  }

  // Fallback to memory-based locking
  const now = Date.now();
  const expiresAt = memoryLocks.get(lockKey);

  if (expiresAt && now < expiresAt) {
    return false; // Already locked
  }

  memoryLocks.set(lockKey, now + ttlSeconds * 1000);
  return true;
}

/**
 * Release an idempotency lock.
 *
 * @param key - Unique key for the operation
 */
async function releaseLock(key: string): Promise<void> {
  const lockKey = `idempotency:${key}`;
  const redis = getRedis();

  if (redis) {
    await redis.del(lockKey);
  } else {
    memoryLocks.delete(lockKey);
  }
}

/**
 * Check if a lock exists without acquiring it.
 *
 * @param key - Unique key for the operation
 * @returns true if locked, false otherwise
 */
export async function isLocked(key: string): Promise<boolean> {
  const lockKey = `idempotency:${key}`;
  const redis = getRedis();

  if (redis) {
    const result = await redis.exists(lockKey);
    return result === 1;
  }

  const now = Date.now();
  const expiresAt = memoryLocks.get(lockKey);
  return !!expiresAt && now < expiresAt;
}

// ============================================================================
// Main Idempotency Function
// ============================================================================

/**
 * Execute an operation with idempotency protection.
 *
 * Ensures that only one instance of the operation runs at a time for a given key.
 * If another operation with the same key is in progress, throws an IdempotencyError.
 *
 * @param key - Unique key for the operation (e.g., `claim:${userId}:${artistId}`)
 * @param ttlSeconds - How long to hold the lock (should exceed expected operation time)
 * @param fn - The operation to execute
 * @returns The result of the operation
 * @throws IdempotencyError if the operation is already in progress
 *
 * @example
 * ```typescript
 * try {
 *   const result = await withIdempotency(
 *     `claim:${userId}:${artistId}`,
 *     30,
 *     async () => claimArtist(userId, artistId)
 *   );
 * } catch (error) {
 *   if (error instanceof IdempotencyError) {
 *     // Operation already in progress
 *   }
 * }
 * ```
 */
export async function withIdempotency<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const acquired = await acquireLock(key, ttlSeconds);

  if (!acquired) {
    throw new IdempotencyError(
      'This action is already in progress. Please wait.',
      key
    );
  }

  try {
    return await fn();
  } finally {
    await releaseLock(key);
  }
}

/**
 * Execute an operation with idempotency protection, returning a result object
 * instead of throwing on lock failure.
 *
 * Useful when you want to handle the "already in progress" case without try/catch.
 *
 * @param key - Unique key for the operation
 * @param ttlSeconds - How long to hold the lock
 * @param fn - The operation to execute
 * @returns Result object with success status and data/error
 *
 * @example
 * ```typescript
 * const result = await tryWithIdempotency(
 *   `claim:${userId}:${artistId}`,
 *   30,
 *   async () => claimArtist(userId, artistId)
 * );
 *
 * if (result.locked) {
 *   return { error: 'Operation in progress' };
 * }
 *
 * if (!result.success) {
 *   return { error: result.error };
 * }
 *
 * return result.data;
 * ```
 */
export async function tryWithIdempotency<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<IdempotencyResult<T>> {
  const acquired = await acquireLock(key, ttlSeconds);

  if (!acquired) {
    return {
      success: false,
      locked: true,
      error: 'This action is already in progress. Please wait.',
    };
  }

  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  } finally {
    await releaseLock(key);
  }
}

// ============================================================================
// Idempotency Key Builders
// ============================================================================

/**
 * Build an idempotency key for profile claim operations.
 *
 * @param userId - The user attempting the claim
 * @param spotifyArtistId - The Spotify artist ID being claimed
 * @returns Idempotency key string
 */
export function buildClaimIdempotencyKey(
  userId: string,
  spotifyArtistId: string
): string {
  return `claim:${userId}:${spotifyArtistId}`;
}

/**
 * Build an idempotency key for data refresh operations.
 *
 * @param artistId - The internal artist ID being refreshed
 * @returns Idempotency key string
 */
export function buildRefreshIdempotencyKey(artistId: string): string {
  return `refresh:${artistId}`;
}

/**
 * Build an idempotency key for a generic operation.
 *
 * @param operation - Operation type identifier
 * @param identifiers - Array of identifiers to include in the key
 * @returns Idempotency key string
 */
export function buildIdempotencyKey(
  operation: string,
  ...identifiers: string[]
): string {
  return [operation, ...identifiers].join(':');
}
