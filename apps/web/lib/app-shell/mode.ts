import type { AppShellMode } from '@/types/app-shell';

/**
 * Internal request header set by the proxy from the public URL before Next.js
 * applies rewrites. The proxy always overwrites an inbound value, so server
 * components may use it as a trusted shell-mode signal.
 */
export const APP_SHELL_MODE_HEADER = 'x-jovie-app-shell-mode';

export function resolveAppShellModeFromPathname(
  pathname: string | null | undefined
): AppShellMode {
  return pathname === '/app/ov' || pathname?.startsWith('/app/ov/')
    ? 'ov'
    : 'customer';
}

export function parseTrustedAppShellMode(
  value: string | null | undefined
): AppShellMode {
  return value === 'ov' ? 'ov' : 'customer';
}
