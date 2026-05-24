const COOKIE_BANNER_SUPPRESSED_PATH_PREFIXES = [
  '/app',
  '/demo',
  '/desktop-auth',
  '/auth',
  '/signin',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/sso-callback',
] as const;

export function shouldSuppressCookieBannerForPathname(
  pathname: string | null | undefined
): boolean {
  if (!pathname) return false;
  return COOKIE_BANNER_SUPPRESSED_PATH_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
