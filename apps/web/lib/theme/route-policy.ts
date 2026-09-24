/**
 * Browser theme route policy.
 *
 * The root layout serializes this policy for the synchronous prepaint script;
 * CoreProviders consumes the same object after hydration. Keep marketing route
 * families explicit so a public artist/profile URL can never inherit the
 * marketing preference by prefix accident.
 */

export const THEME_ROUTE_POLICY = {
  exact: [
    '/',
    '/new',
    '/pricing',
    '/card',
    '/artist-profiles',
    '/artist-profile',
    '/artist-notifications',
    '/download',
    '/pay',
    '/voice',
    '/instant-merch',
    '/youtube-thumbnails',
    '/product',
    '/smart-links',
    '/launch',
    '/about',
    '/support',
    '/developers',
    '/api-versioning',
    '/cli',
    '/ai',
    '/demovideo',
    '/demo/video',
    '/investors',
  ],
  prefixes: [
    '/app',
    '/onboarding',
    '/signin',
    '/signup',
    '/waitlist',
    '/compare',
    '/alternatives',
    '/blog',
    '/changelog',
    '/renders',
    '/engineering',
  ],
} as const;

function matchesRouteBoundary(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isThemeRoute(pathname: string): boolean {
  if ((THEME_ROUTE_POLICY.exact as readonly string[]).includes(pathname)) {
    return true;
  }

  return THEME_ROUTE_POLICY.prefixes.some(prefix =>
    matchesRouteBoundary(pathname, prefix)
  );
}
