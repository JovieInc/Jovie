import 'server-only';

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
export async function getCurrentAdminPageAccess(): Promise<AdminPageAccess> {
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
