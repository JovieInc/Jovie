/**
 * Browser theme route policy.
 *
 * The root layout serializes this policy for the synchronous prepaint script;
 * CoreProviders consumes the same object after hydration. Keep marketing route
 * families explicit so a public artist/profile URL can never inherit the
 * marketing preference by prefix accident.
 */

const THEME_SWITCHING_ROUTE_POLICY = {
  exact: [
    '/',
    '/new',
    '/pricing',
    '/card',
    '/artist-profiles',
    '/artist-profile',
    '/artist-notifications',
    '/solutions/artists',
    '/download',
    '/pay',
    '/voice',
    '/instant-merch',
    '/integrations',
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
    '/solutions',
    '/blog',
    '/changelog',
    '/renders',
    '/engineering',
  ],
} as const;

const DARK_ONLY_ROUTE_POLICY = { exact: [], prefixes: [] } as const;

/**
 * Theme switching ships OFF (Tim, 2026-09-26): everyone sees dark mode until
 * light mode is certified. Set NEXT_PUBLIC_FEATURE_THEME_SWITCHING=1 at build
 * time to restore the per-route light/dark/system choice. NEXT_PUBLIC_ keeps
 * the server prepaint policy and the client providers in agreement.
 */
export const THEME_SWITCHING_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING === '1' ||
  process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING === 'true';

/**
 * Routes where the visitor may choose a theme. Empty while theme switching is
 * off, so the prepaint script and providers force dark everywhere and the
 * footer theme control stays hidden.
 */
export const THEME_ROUTE_POLICY: {
  readonly exact: readonly string[];
  readonly prefixes: readonly string[];
} = THEME_SWITCHING_ENABLED
  ? THEME_SWITCHING_ROUTE_POLICY
  : DARK_ONLY_ROUTE_POLICY;

function matchesRouteBoundary(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isThemeRoute(pathname: string): boolean {
  if (THEME_ROUTE_POLICY.exact.includes(pathname)) {
    return true;
  }

  return THEME_ROUTE_POLICY.prefixes.some(prefix =>
    matchesRouteBoundary(pathname, prefix)
  );
}
