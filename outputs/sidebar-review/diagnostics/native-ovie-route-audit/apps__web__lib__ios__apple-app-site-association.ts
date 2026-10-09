import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';

/** Apple Developer Team ID for Jovie Inc. */
export const JOVIE_APPLE_TEAM_ID = 'G24T327LXT';

/** iOS bundle identifier for the native Jovie app. */
export const JOVIE_IOS_BUNDLE_ID = 'ie.jov.Jovie';

/**
 * `/app/*` destinations that are intentionally web-only (JOV-7632). The iOS
 * route manifest has no surface for them, so the AASA `NOT` entries below keep
 * iOS from pulling users into the app and stranding them — Safari keeps the
 * page instead. `MobileWebOnlyRouteBoundary` in the iOS app is the paired
 * defense-in-depth list; keep both in sync. Merch checkout lives at
 * `/<handle>/merch/<cardId>` outside `/app/*` and is never claimed.
 */
export const IOS_WEB_ONLY_APP_PATH_PREFIXES = [
  APP_ROUTES.YOUTUBE_REVIVAL,
  APP_ROUTES.INSIGHTS,
  APP_ROUTES.JOVIE_WORK,
  APP_ROUTES.DASHBOARD_RELEASE_PLAN,
  APP_ROUTES.LEGACY_DASHBOARD_INSIGHTS,
] as const;

/**
 * Canonical Apple App Site Association payload for jov.ie Universal Links.
 *
 * Served at both:
 * - /.well-known/apple-app-site-association (canonical per Apple)
 * - /apple-app-site-association (legacy root-path fallback)
 */
export const JOVIE_APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    apps: [] as string[],
    details: [
      {
        appID: `${JOVIE_APPLE_TEAM_ID}.${JOVIE_IOS_BUNDLE_ID}`,
        paths: [
          // Legacy `paths` syntax: "NOT" exclusions must precede the wildcard.
          ...IOS_WEB_ONLY_APP_PATH_PREFIXES.flatMap(prefix => [
            `NOT ${prefix}`,
            `NOT ${prefix}/*`,
          ]),
          '/app/*',
          '/auth/ios/complete',
          '/auth/ios/complete?*',
          '/auth/native-return',
          '/auth/native-return?*',
        ],
      },
    ],
  },
} as const;

const AASA_CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400';

export function appleAppSiteAssociationGET(): NextResponse {
  return NextResponse.json(JOVIE_APPLE_APP_SITE_ASSOCIATION, {
    headers: {
      'Cache-Control': AASA_CACHE_CONTROL,
    },
  });
}
