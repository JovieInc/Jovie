import 'server-only';

import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { resolveAppShellModeFromPathname } from '@/lib/app-shell/mode';
import {
  APP_SHELL_WORKSPACES,
  canAccessAppShellWorkspace,
} from '@/lib/app-shell/workspaces';
import type { AppShellMode } from '@/types/app-shell';

export function resolveAppShellMode(pathname: string | null): AppShellMode {
  return resolveAppShellModeFromPathname(pathname);
}

/**
 * Fail closed before the shared shell and its route children are returned.
 * Mutation/API authorization remains owned by the existing admin gates.
 */
export async function requireAppShellModeAccess(
  mode: AppShellMode
): Promise<void> {
  const workspace = APP_SHELL_WORKSPACES.find(item => item.id === mode);
  if (!workspace || workspace.access !== 'admin') return;

  const access = await getCurrentAdminPageAccess();
  if (
    !access.isAuthenticated ||
    !access.userId ||
    !canAccessAppShellWorkspace(workspace, { isAdmin: access.hasAdminRole })
  ) {
    redirect(APP_ROUTES.DASHBOARD);
  }
}
