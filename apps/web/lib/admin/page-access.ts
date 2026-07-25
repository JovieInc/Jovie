import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';

export interface AdminPageAccess {
  readonly userId: string | null;
  readonly isAuthenticated: boolean;
  readonly hasAdminRole: boolean;
}

/**
 * Admin page navigation is role-gated so stale MFA does not dump an admin out
 * of the workspace. Admin mutations stay MFA-gated through requireAdmin() and
 * entitlement-backed API checks.
 */
export const getCurrentAdminPageAccess = cache(
  async function getCurrentAdminPageAccess(): Promise<AdminPageAccess> {
    const { userId } = await getCachedAuth();

    if (!userId) {
      return {
        userId: null,
        isAuthenticated: false,
        hasAdminRole: false,
      };
    }

    return {
      userId,
      isAuthenticated: true,
      hasAdminRole: await checkAdminRole(userId),
    };
  }
);

/**
 * Authoritative page-level read gate. Next may render layouts and pages in
 * parallel, so protected page/DAL work must await this before starting.
 */
export async function requireCurrentAdminPageAccess(): Promise<string> {
  const access = await getCurrentAdminPageAccess();

  if (!access.isAuthenticated || !access.userId || !access.hasAdminRole) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  return access.userId;
}
