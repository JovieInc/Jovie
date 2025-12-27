import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { createScopedLogger } from '@/lib/utils/logger';

const log = createScopedLogger('Admin-Roles');

/**
 * In-memory cache for admin role checks
 * TTL: 5 minutes
 */
const roleCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a user has admin role based on database verification.
 * Results are cached for 5 minutes to reduce database queries.
 *
 * @param userId - Clerk user ID
 * @returns Promise<boolean> - True if user has admin role
 */
export async function isAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;

  // Check cache first
  const cached = roleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isAdmin;
  }

  try {
    // Query database for admin role
    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    const isUserAdmin = user?.isAdmin ?? false;

    // Cache the result
    roleCache.set(userId, {
      isAdmin: isUserAdmin,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return isUserAdmin;
  } catch (error) {
    log.error('Failed to check admin status', { error });
    // Fail closed - deny access on error
    return false;
  }
}

/**
 * Invalidate the admin role cache for a specific user.
 * Call this after granting or revoking admin privileges.
 *
 * @param userId - Clerk user ID
 */
export function invalidateAdminCache(userId: string): void {
  roleCache.delete(userId);
}

/**
 * Clear the entire admin role cache.
 * Useful for testing or after bulk role updates.
 */
export function clearAdminCache(): void {
  roleCache.clear();
}
