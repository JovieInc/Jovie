import { getPublicProfileCandidate } from '@/lib/routing/proxy-routing';

const COOKIE_BANNER_SUPPRESSED_PATH_PREFIXES = [
  '/app',
  '/demo',
  '/desktop-auth',
  '/start',
  // Native/browser auth handoff routes should stay free of visible banner chrome.
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

/**
 * True when the cookie card must clear the fixed public-profile dock.
 *
 * Public profiles own nested interaction routes such as `/:handle/alerts`, so
 * classification is based on the first segment while still delegating the
 * reserved-handle rules to the canonical proxy-routing helper.
 */
export function shouldPlaceCookieBannerAbovePublicProfileDock(
  pathname: string | null | undefined
): boolean {
  const firstSegment = pathname?.split('/').filter(Boolean)[0];
  if (!firstSegment) return false;

  return getPublicProfileCandidate(`/${firstSegment}`) !== null;
}
