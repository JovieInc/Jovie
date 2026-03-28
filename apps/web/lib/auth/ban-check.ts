import 'server-only';

import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { checkUserStatus } from '@/lib/auth/status-checker';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { captureError } from '@/lib/error-tracking';

interface BanStatus {
  isBanned: boolean;
}

/**
 * Lightweight ban check for the app shell layout.
 *
 * The proxy middleware skips user state lookups for /app/* routes
 * (proxy.ts:581-585), so the middleware-level ban check never fires
 * for dashboard pages. This function fills that gap.
 *
 * Note: accepts a Clerk user ID (from getCachedAuth().userId) and
 * queries by users.clerkId, not users.id.
 *
 * Wrapped in React cache() so it's deduplicated per request when
 * called from both the layout and child components.
 */
export const getUserBanStatus = cache(
  async (clerkUserId: string): Promise<BanStatus> => {
    try {
      const [user] = await db
        .select({
          userStatus: users.userStatus,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!user) {
        return { isBanned: false };
      }

      const { isBlocked } = checkUserStatus(user.userStatus, user.deletedAt);
      return { isBanned: isBlocked };
    } catch (error) {
      // Fail closed: proxy.ts skips user-state checks for /app/* routes,
      // so this is the only enforcement layer for dashboard pages.
      // Showing "unavailable" on transient DB errors is safer than
      // letting a banned user through.
      captureError('Ban status check failed', error, { clerkUserId });
      return { isBanned: true };
    }
  }
);
