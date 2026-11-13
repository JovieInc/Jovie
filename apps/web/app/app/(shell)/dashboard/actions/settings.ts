'use server';

/**
 * User dashboard settings server actions.
 *
 * This module provides server actions for managing user-specific
 * dashboard settings like sidebar collapse state.
 */

import { unstable_noStore as noStore } from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { userSettings } from '@/lib/db/schema/auth';
import { captureError } from '@/lib/error-tracking';

/**
 * Updates the sidebar collapsed state for the current user.
 *
 * This server action upserts the user's settings to persist their
 * sidebar preference. It deliberately does not expire any cache tag: the
 * `sidebar:state` cookie is the SSR source of truth, and this row is only
 * read as the fallback for a browser without that cookie
 * (`DashboardShellContent`). Expiring `DASHBOARD_DATA` here re-rendered the
 * whole shell on every toggle; the fallback instead converges within the
 * dashboard cache TTL.
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
  } catch (error) {
    await captureError('setSidebarCollapsed failed', error, {
      route: 'dashboard/actions/settings',
    });
    throw error;
  }
}
