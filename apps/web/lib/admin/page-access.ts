import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  isAdmin as checkAdminRole,
  hasAdminReadAccess,
} from '@/lib/admin/roles';
import { getFreshAuth } from '@/lib/auth/cached';
import { assertOviePrivacyUnlocked } from '@/lib/ovie/privacy-lock/server';

export interface AdminPageAccess {
  readonly userId: string | null;
  readonly isAuthenticated: boolean;
  /** Full admin: may mutate. */
  readonly hasAdminRole: boolean;
  /** Full admin or read-only operator: may view admin pages. */
  readonly hasAdminReadRole: boolean;
}

/**
 * Admin page navigation is role-gated so stale MFA does not dump an admin out
 * of the workspace. Admin mutations stay MFA-gated through requireAdmin() and
 * entitlement-backed API checks.
 */
export const getCurrentAdminPageAccess = cache(
  async function getCurrentAdminPageAccess(): Promise<AdminPageAccess> {
    const auth = await getFreshAuth();
    const userId = auth.actorUserId ?? auth.userId;

    if (!userId) {
      return {
        userId: null,
        isAuthenticated: false,
        hasAdminRole: false,
        hasAdminReadRole: false,
      };
    }

    const hasAdminRole = await checkAdminRole(userId);
    return {
      userId,
      isAuthenticated: true,
      hasAdminRole,
      hasAdminReadRole: hasAdminRole || (await hasAdminReadAccess(userId)),
    };
  }
);

/**
 * Authoritative page-level read gate. Full admins by default; read-only operators
 * only on pages that pass `{ access: 'read' }`. Next may render layouts and pages in
 * parallel, so protected page/DAL work must await this before starting.
 */
export async function requireCurrentAdminPageAccess(options?: {
  /**
   * 'write' (default) admits full admins only. 'read' also admits read-only
   * operators and is reserved for the Ovie observation pages listed in
   * admin-read-only-contract.test.ts. A page that does not opt in is invisible
   * to a read-only operator even though the admin layout admits it.
   */
  access?: 'read' | 'write';
}): Promise<string> {
  const access = await getCurrentAdminPageAccess();
  const allowed =
    options?.access === 'read' ? access.hasAdminReadRole : access.hasAdminRole;

  if (!access.isAuthenticated || !access.userId || !allowed) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  const auth = await getFreshAuth();
  await assertOviePrivacyUnlocked(
    auth.sessionId
      ? { userId: access.userId, sessionId: auth.sessionId }
      : undefined
  );
  return access.userId;
}
