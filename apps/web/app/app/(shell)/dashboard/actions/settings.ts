'use server';

/**
 * User dashboard settings server actions.
 *
 * This module provides server actions for managing user-specific
 * dashboard settings like sidebar collapse state.
 */

import {
  unstable_noStore as noStore,
  revalidateTag,
  updateTag,
} from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSession } from '@/lib/auth/session';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { userSettings } from '@/lib/db/schema/auth';
import { captureError } from '@/lib/error-tracking';

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
  noStore();
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      throw new Error('Unauthorized');
    }

    await withDbSession(async appUserId => {
      // Upsert into user_settings — appUserId is already users.id (UUID)
      await db
        .insert(userSettings)
        .values({
          userId: appUserId,
          sidebarCollapsed: collapsed,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: { sidebarCollapsed: collapsed, updatedAt: new Date() },
        });
    });
    updateTag(CACHE_TAGS.DASHBOARD_DATA);
    revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
  } catch (error) {
    await captureError('setSidebarCollapsed failed', error, {
      route: 'dashboard/actions/settings',
    });
    throw error;
  }
}
