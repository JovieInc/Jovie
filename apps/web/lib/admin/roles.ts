import 'server-only';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

const REDIS_CACHE_TTL_SECONDS = 60;
const REDIS_KEY_PREFIX = 'admin:role:';

async function queryAdminRoleFromDB(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.clerkId, userId))
    .limit(1);

  return user?.isAdmin ?? false;
}

async function tryRedisPath(
  userId: string,
  cacheKey: string,
  redis: NonNullable<ReturnType<typeof getRedis>>
): Promise<boolean> {
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return String(cached) === '1';
  }

  const isUserAdmin = await queryAdminRoleFromDB(userId);
  await redis.set(cacheKey, isUserAdmin ? '1' : '0', {
    ex: REDIS_CACHE_TTL_SECONDS,
  });

  return isUserAdmin;
}

export const isAdmin = cache(async function isAdmin(
  userId: string
): Promise<boolean> {
  if (!userId) return false;

  const redis = getRedis();
  const cacheKey = `${REDIS_KEY_PREFIX}${userId}`;

  if (redis) {
    try {
      return await tryRedisPath(userId, cacheKey, redis);
    } catch (error) {
      captureWarning(
        '[admin/roles] Redis cache failed, falling back to database query',
        {
          error,
        }
      );
    }
  }

  return queryAdminRoleFromDB(userId);
});

export function invalidateAdminCache(userId: string): void {
  const redis = getRedis();
  if (!redis) return;

  const cacheKey = `${REDIS_KEY_PREFIX}${userId}`;
  redis.del(cacheKey).catch(error => {
    captureWarning('[admin/roles] Failed to invalidate Redis cache', {
      error,
    });
  });
}

export function clearAdminCache(): void {
  // Request-level React cache is auto-scoped per request.
  // Redis cache invalidation should be done through targeted invalidation.
}
