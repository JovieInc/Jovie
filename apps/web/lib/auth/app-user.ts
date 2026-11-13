import 'server-only';

import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import { withRetry } from '@/lib/db/client/retry';
import { QUERY_TIMEOUTS } from '@/lib/db/query-timeout';
import { users } from '@/lib/db/schema/auth';

export type AppUser = typeof users.$inferSelect;

/**
 * Bounded read replay for the auth-identity user lookups (JOV-12488/12492,
 * Sentry 7846802336): both resolvers are single indexed SELECTs on `users`
 * — replaying once after a transient Neon transport kill is unambiguous
 * (JOV-12188/JOV-8837 read-recovery doctrine). Admission is
 * `isRetryableError`'s transport class, never statement timeouts
 * (JOV-5754); non-transport errors still propagate after one attempt.
 */
const APP_USER_READ_RETRY = {
  operation: 'read',
  maxAttempts: 2,
  retryBudgetMs: QUERY_TIMEOUTS.api,
} as const;

/** Resolve an app user by its canonical `users.id` primary key. */
export const getAppUserById = cache(
  async (userId: string): Promise<AppUser | null> => {
    const [row] = await withRetry(
      () => db.select().from(users).where(eq(users.id, userId)).limit(1),
      `appUserById(${userId})`,
      APP_USER_READ_RETRY
    );
    return row ?? null;
  }
);

/**
 * Resolve the app `users` row linked to a Better Auth identity.
 *
 * Single indexed query (users.better_auth_user_id is unique), memoized per
 * request via React `cache()` so layouts/actions sharing a render pass hit
 * the database once.
 */
export const getAppUserByBetterAuthId = cache(
  async (betterAuthUserId: string): Promise<AppUser | null> => {
    const [row] = await withRetry(
      () =>
        db
          .select()
          .from(users)
          .where(eq(users.betterAuthUserId, betterAuthUserId))
          .limit(1),
      `appUserByBetterAuthId(${betterAuthUserId})`,
      APP_USER_READ_RETRY
    );
    return row ?? null;
  }
);
