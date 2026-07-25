import 'server-only';

import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { resolveAppShellModeFromPathname } from '@/lib/app-shell/mode';
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
  if (mode !== 'ov') return;

  const access = await getCurrentAdminPageAccess();
  if (!access.isAuthenticated || !access.userId || !access.hasAdminRole) {
    redirect(APP_ROUTES.DASHBOARD);
  }
}
