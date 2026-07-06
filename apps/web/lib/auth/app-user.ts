import 'server-only';

import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

export type AppUser = typeof users.$inferSelect;

/**
 * Resolve the app `users` row linked to a Better Auth identity.
 *
 * Single indexed query (users.better_auth_user_id is unique), memoized per
 * request via React `cache()` so layouts/actions sharing a render pass hit
 * the database once.
 */
export const getAppUserByBetterAuthId = cache(
  async (betterAuthUserId: string): Promise<AppUser | null> => {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.betterAuthUserId, betterAuthUserId))
      .limit(1);
    return row ?? null;
  }
);
