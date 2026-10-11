import 'server-only';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { getCachedDevTestAuthSession } from '@/lib/auth/dev-test-auth.server';
import { checkUserStatus } from '@/lib/auth/status-checker';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { isVisualCaptureSyntheticAuthEnabled } from '@/lib/e2e/runtime';
import { captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

const REDIS_KEY_PREFIX = 'admin:role:';

async function queryAdminRoleFromDB(userId: string): Promise<boolean> {
  const [user] = await db
    .select({
      isAdmin: users.isAdmin,
      userStatus: users.userStatus,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.isAdmin) return false;

  return !checkUserStatus(user.userStatus, user.deletedAt).isBlocked;
}

/**
 * Secretless visual capture has no database to verify a real admin role
 * (JOV-7126). The only way to grant admin here is the producer's own
 * dev-test-auth bypass session explicitly requesting the `admin` persona for
 * this exact synthetic user — every other persona, including the default
 * creator-ready capture lane (pr-visual-review.yml, the homepage lane in
 * ci.yml), stays denied exactly as before. This never touches Postgres and
 * never runs outside the already-gated E2E_USE_TEST_AUTH_BYPASS
 * trusted-host bypass, so it cannot widen real admin access.
 */
async function isSyntheticCaptureAdmin(userId: string): Promise<boolean> {
  const session = await getCachedDevTestAuthSession();
  return session?.isAdmin === true && session.dbUserId === userId;
}

/**
 * Postgres is the source of truth. A cached "yes" was always rechecked
 * against this query, so the Redis GET+SET on the admin path did not
 * change the result and only spent Upstash commands. Denials are read
 * here too: a stale Redis "0" must not hide admin, and a stale "1" must
 * not grant it.
 */
export const isAdmin = cache(async function isAdmin(
  userId: string
): Promise<boolean> {
  if (!userId) return false;
  if (isVisualCaptureSyntheticAuthEnabled()) {
    return isSyntheticCaptureAdmin(userId);
  }

  try {
    return await queryAdminRoleFromDB(userId);
  } catch (error) {
    captureWarning(
      '[admin/roles] Database query failed, treating as non-admin',
      error,
      {
        userId,
      }
    );
    return false;
  }
});

/**
 * Deletes a leftover `admin:role:*` key. `isAdmin` does not read Redis.
 * Grant and revoke still delete the key so an older instance during
 * rollout cannot keep a cached denial.
 */
export function invalidateAdminCache(userId: string): void {
  const redis = getRedis();
  if (!redis) return;

  const cacheKey = `${REDIS_KEY_PREFIX}${userId}`;
  redis.del(cacheKey).catch(error => {
    captureWarning('[admin/roles] Failed to invalidate Redis cache', error);
  });
}

export function clearAdminCache(): void {
  // Request-level React cache is auto-scoped per request.
  // Redis cache invalidation should be done through targeted invalidation.
}
