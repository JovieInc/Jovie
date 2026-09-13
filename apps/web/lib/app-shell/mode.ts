import { APP_ROUTES } from '@/constants/routes';
import type { AppShellMode } from '@/types/app-shell';

/**
 * Internal request header set by the proxy from the public URL before Next.js
 * applies rewrites. The proxy always overwrites an inbound value, so server
 * components may use it as a trusted shell-mode signal.
 */
export const APP_SHELL_MODE_HEADER = 'x-jovie-app-shell-mode';

export function isOvieAppShellPathname(
  pathname: string | null | undefined
): boolean {
  if (!pathname) return false;
  return (
    pathname === APP_ROUTES.HUD ||
    pathname === APP_ROUTES.OV ||
    pathname.startsWith(`${APP_ROUTES.OV}/`)
  );
}

export function resolveAppShellModeFromPathname(
  pathname: string | null | undefined
): AppShellMode {
  return isOvieAppShellPathname(pathname) ? 'ov' : 'customer';
}

export function parseTrustedAppShellMode(
  value: string | null | undefined
): AppShellMode {
  return value === 'ov' ? 'ov' : 'customer';
}
