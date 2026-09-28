import { NextResponse } from 'next/server';

/** Apple Developer Team ID for Jovie Inc. */
export const JOVIE_APPLE_TEAM_ID = 'G24T327LXT';

/** iOS bundle identifier for the native Jovie app. */
export const JOVIE_IOS_BUNDLE_ID = 'ie.jov.Jovie';

/** Team-prefixed app ID shared by the iOS app and the Swift-native Mac app. */
export const JOVIE_APPLE_APP_ID = `${JOVIE_APPLE_TEAM_ID}.${JOVIE_IOS_BUNDLE_ID}`;

/**
 * Canonical Apple App Site Association payload for jov.ie Universal Links
 * and shared web credentials. `webcredentials` lets the native apps use
 * jov.ie passkeys (iCloud Keychain, 1Password) through AuthenticationServices;
 * each app still needs a matching `webcredentials:` Associated Domains
 * entitlement (docs/macos/ADR-swift-native-mac.md).
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
        appID: JOVIE_APPLE_APP_ID,
        paths: [
          '/app/*',
          '/auth/ios/complete',
          '/auth/ios/complete?*',
          '/auth/native-return',
          '/auth/native-return?*',
        ],
      },
    ],
  },
  webcredentials: {
    apps: [JOVIE_APPLE_APP_ID],
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
