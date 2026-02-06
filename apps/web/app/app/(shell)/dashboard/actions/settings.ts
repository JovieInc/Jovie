'use server';

/**
 * User dashboard settings server actions.
 *
 * This module provides server actions for managing user-specific
 * dashboard settings like sidebar collapse state.
 */

import { eq } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidateTag,
  updateTag,
} from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { userSettings, users } from '@/lib/db/schema/auth';

/**
 * Updates the sidebar collapsed state for the current user.
 *
 * This server action upserts the user's settings to persist their
 * sidebar preference. It invalidates dashboard data cache tags
 * after the update to ensure UI consistency.
 *
 * @param collapsed - Whether the sidebar should be collapsed
 * @throws Error if the user is not authenticated or not found
 */
export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  'use server';
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  await withDbSession(async clerkUserId => {
    // Get DB user id
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user?.id) throw new TypeError('User not found');

    // Upsert into user_settings
    await db
      .insert(userSettings)
      .values({
        userId: user.id,
        sidebarCollapsed: collapsed,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { sidebarCollapsed: collapsed, updatedAt: new Date() },
      });
  });
  updateTag('dashboard-data');
  revalidateTag('dashboard-data', 'max');
}
