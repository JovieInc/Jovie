import 'server-only';

import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

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
 * Wrapped in React cache() so it's deduplicated per request when
 * called from both the layout and child components.
 */
export const getUserBanStatus = cache(
  async (userId: string): Promise<BanStatus> => {
    try {
      const [user] = await db
        .select({
          userStatus: users.userStatus,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return { isBanned: false };
      }

      const isBanned =
        user.deletedAt !== null ||
        user.userStatus === 'banned' ||
        user.userStatus === 'suspended';

      return { isBanned };
    } catch {
      // On DB failure, don't block the user. The proxy-level check
      // (for non-/app paths) is the primary enforcement layer.
      return { isBanned: false };
    }
  }
);
