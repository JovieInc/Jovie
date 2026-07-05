/**
 * Auth and OAuth callback routes must never be served the PWA offline fallback.
 * Keep public/sw.js AUTH_NAVIGATION_PATH_PREFIXES in sync when changing this list.
 */
export const AUTH_NAVIGATION_PATH_PREFIXES = [
  '/sso-callback',
  '/signin/sso-callback',
  '/signup/sso-callback',
  '/sign-in/sso-callback',
  '/sign-up/sso-callback',
  '/signin',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/auth',
  '/auth-return',
  '/desktop-auth',
  '/mobile-auth-return',
  '/__clerk',
  '/clerk',
] as const;

export function isAuthNavigationPath(pathname: string): boolean {
  return AUTH_NAVIGATION_PATH_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
