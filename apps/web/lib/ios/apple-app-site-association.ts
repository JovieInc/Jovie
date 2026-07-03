import { NextResponse } from 'next/server';

/** Apple Developer Team ID for Jovie Inc. */
export const JOVIE_APPLE_TEAM_ID = 'G24T327LXT';

/** iOS bundle identifier for the native Jovie app. */
export const JOVIE_IOS_BUNDLE_ID = 'ie.jov.Jovie';

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
        paths: ['/app/*', '/auth/*'],
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
