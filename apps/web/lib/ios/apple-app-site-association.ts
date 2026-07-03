import { NextResponse } from 'next/server';

/** Apple Developer Team ID for Jovie iOS (ie.jov.Jovie). */
export const JOVIE_IOS_TEAM_ID = 'G24T327LXT';

/** iOS bundle identifier served by the native Jovie app. */
export const JOVIE_IOS_BUNDLE_ID = 'ie.jov.Jovie';

/**
 * Canonical Apple App Site Association payload for jov.ie Universal Links.
 * Clerk webcredentials live on the Clerk FAPI host (see Jovie.entitlements), not jov.ie.
 */
export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    apps: [] as string[],
    details: [
      {
        appID: `${JOVIE_IOS_TEAM_ID}.${JOVIE_IOS_BUNDLE_ID}`,
        paths: ['/app/*', '/auth/*'],
      },
    ],
  },
} as const;

const AASA_RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
} as const;

export function createAppleAppSiteAssociationResponse(): NextResponse {
  return NextResponse.json(APPLE_APP_SITE_ASSOCIATION, {
    status: 200,
    headers: AASA_RESPONSE_HEADERS,
  });
}
