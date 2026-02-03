/**
 * Profile Service Mutations
 *
 * Centralized profile update operations.
 */

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import type { ProfileData, ProfileUpdateData } from './types';

// Redis key prefix for view count batching
const VIEW_COUNT_KEY_PREFIX = 'profile:views:';
// Threshold of views to trigger a flush to the database
const VIEW_FLUSH_THRESHOLD = 10;
// TTL for view counts in Redis (1 hour) - ensures eventual consistency
const VIEW_COUNT_TTL_SECONDS = 3600;

/**
 * Update a profile by ID.
 *
 * @param profileId - The profile ID to update
 * @param updates - The fields to update
 * @returns Updated profile or null if not found
 */
export async function updateProfileById(
  profileId: string,
  updates: ProfileUpdateData
): Promise<ProfileData | null> {
  const [updated] = await db
    .update(creatorProfiles)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId))
    .returning();

  if (updated?.usernameNormalized) {
    await invalidateProfileCache(updated.usernameNormalized);
  }

  return updated ?? null;
}

/**
 * Update a profile by user's Clerk ID.
 *
 * @param clerkUserId - The Clerk user ID
 * @param updates - The fields to update
 * @returns Updated profile or null if not found
 */
export async function updateProfileByClerkId(
  clerkUserId: string,
  updates: ProfileUpdateData
): Promise<ProfileData | null> {
  // First get the user ID from clerk_id
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!user) {
    throw new TypeError('User not found');
  }

  const [updated] = await db
    .update(creatorProfiles)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.userId, user.id))
    .returning();

  if (updated?.usernameNormalized) {
    await invalidateProfileCache(updated.usernameNormalized);
  }

  return updated ?? null;
}

/**
 * Increment profile view count with Redis batching.
 *
 * Uses Redis INCR for fast atomic counting, then flushes to the database
 * when threshold is reached. This reduces database writes by ~10x under load.
 *
 * Falls back to direct database write if Redis is unavailable.
 *
 * @param username - The username to increment views for
 */
export async function incrementProfileViews(username: string): Promise<void> {
  const normalizedUsername = username.toLowerCase();
  const redisKey = `${VIEW_COUNT_KEY_PREFIX}${normalizedUsername}`;
  const redis = getRedis();

  // If Redis is available, use batched counting
  if (redis) {
    try {
      // Atomically increment and get new count
      const newCount = await redis.incr(redisKey);

      // Set TTL on first increment (ensures eventual flush even if threshold not reached)
      if (newCount === 1) {
        await redis.expire(redisKey, VIEW_COUNT_TTL_SECONDS);
      }

      // Flush to database when threshold is reached
      if (newCount >= VIEW_FLUSH_THRESHOLD) {
        // Use GETSET for atomic read-and-reset to prevent race conditions
        // This ensures only one concurrent request gets the accumulated count
        const countToFlush = await redis.getset(redisKey, '0');

        // Only flush if we successfully got a count (another request may have won the race)
        if (countToFlush && Number(countToFlush) > 0) {
          const flushCount = Number(countToFlush);

          // Reset TTL after atomic swap
          await redis.expire(redisKey, VIEW_COUNT_TTL_SECONDS);

          // Flush accumulated views to database (fire-and-forget)
          flushViewsToDatabase(normalizedUsername, flushCount).catch(error => {
            captureError('Failed to flush views to database', error, {
              username: normalizedUsername,
              flushCount,
            });
            // Put the count back in Redis if DB flush failed
            redis?.incrby(redisKey, flushCount).catch(() => {});
          });
        }
      }

      return;
    } catch (error) {
      captureWarning(
        'Redis view increment failed, falling back to direct DB',
        error,
        {
          username: normalizedUsername,
        }
      );
      // Fall through to direct DB write
    }
  }

  // Fallback: Direct database write (original behavior)
  await incrementViewsDirectly(normalizedUsername);
}

/**
 * Flush accumulated view counts from Redis to the database.
 */
async function flushViewsToDatabase(
  normalizedUsername: string,
  count: number
): Promise<void> {
  await db
    .update(creatorProfiles)
    .set({
      profileViews: drizzleSql`${creatorProfiles.profileViews} + ${count}`,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.usernameNormalized, normalizedUsername));
}

/**
 * Direct database view increment with retry logic.
 * Used as fallback when Redis is unavailable.
 */
async function incrementViewsDirectly(
  normalizedUsername: string,
  maxRetries = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await db
        .update(creatorProfiles)
        .set({
          profileViews: drizzleSql`${creatorProfiles.profileViews} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.usernameNormalized, normalizedUsername));

      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Retry logging - lastError is captured on final failure below

      if (attempt < maxRetries) {
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }
  }

  captureError('Profile view increment failed', lastError, {
    username: normalizedUsername,
    maxRetries,
  });
}

/**
 * Flush all pending view counts from Redis to the database.
 * Call this from a scheduled job (e.g., cron) to ensure eventual consistency.
 */
export async function flushAllPendingViews(): Promise<number> {
  const redis = getRedis();
  if (!redis) {
    captureWarning('Redis not available for view flush');
    return 0;
  }

  let flushedCount = 0;

  try {
    // Scan for all view count keys
    const keys: string[] = [];
    let cursor: string | number = 0;

    do {
      const result: [string | number, string[]] = await redis.scan(cursor, {
        match: `${VIEW_COUNT_KEY_PREFIX}*`,
        count: 100,
      });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0 && cursor !== '0');

    // Flush each profile's views
    for (const key of keys) {
      const count = await redis.getdel(key);
      if (count && Number(count) > 0) {
        const username = key.replace(VIEW_COUNT_KEY_PREFIX, '');
        await flushViewsToDatabase(username, Number(count));
        flushedCount++;
      }
    }

    // Successfully flushed views - no logging needed
  } catch (error) {
    captureError('Failed to flush pending views', error, { flushedCount });
  }

  return flushedCount;
}

/**
 * Publish a profile (set isPublic=true, mark onboarding complete).
 *
 * @param profileId - The profile ID
 * @param displayName - The display name to set
 * @param bio - Optional bio
 * @returns Updated profile or null
 */
export async function publishProfile(
  profileId: string,
  displayName: string,
  bio?: string
): Promise<ProfileData | null> {
  return updateProfileById(profileId, {
    displayName,
    bio,
    isPublic: true,
    onboardingCompletedAt: new Date(),
  });
}
