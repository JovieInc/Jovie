import { APP_ROUTES } from '@/constants/routes';

/**
 * Single-segment legacy paths that must never hit the public profile catch-all.
 * Redirect at the proxy layer so no DB lookup or soft-404 page is rendered.
 */
export const LEGACY_ROOT_PATH_REDIRECTS: Readonly<Record<string, string>> = {
  '/login': APP_ROUTES.SIGNIN,
  '/request-access': APP_ROUTES.START,
};

/**
 * Resolve a legacy root-path redirect target, or null when none applies.
 */
export function resolveLegacyRootPathRedirect(pathname: string): string | null {
  return LEGACY_ROOT_PATH_REDIRECTS[pathname] ?? null;
}
