/**
 * Apple App Site Association (AASA) for the native Jovie iOS app.
 *
 * Served at:
 * - /.well-known/apple-app-site-association (canonical)
 * - /apple-app-site-association (legacy root path)
 *
 * Team ID matches fastlane/Appfile and oauth-redirect-uris.expected.json.
 * Bundle ID matches apps/ios/Jovie.xcodeproj.
 */

export const JOVIE_IOS_TEAM_ID = 'G24T327LXT' as const;
export const JOVIE_IOS_BUNDLE_ID = 'ie.jov.Jovie' as const;

export const JOVIE_IOS_APP_ID =
  `${JOVIE_IOS_TEAM_ID}.${JOVIE_IOS_BUNDLE_ID}` as const;

export interface AppleAppSiteAssociationDocument {
  readonly applinks: {
    readonly apps: readonly [];
    readonly details: readonly [
      {
        readonly appID: typeof JOVIE_IOS_APP_ID;
        readonly paths: readonly ['/app/*', '/auth/*'];
      },
    ];
  };
}

export const APPLE_APP_SITE_ASSOCIATION_DOCUMENT: AppleAppSiteAssociationDocument =
  {
    applinks: {
      apps: [],
      details: [
        {
          appID: JOVIE_IOS_APP_ID,
          paths: ['/app/*', '/auth/*'],
        },
      ],
    },
  };

const AASA_JSON_BODY = `${JSON.stringify(APPLE_APP_SITE_ASSOCIATION_DOCUMENT)}\n`;

export function createAppleAppSiteAssociationResponse(): Response {
  return new Response(AASA_JSON_BODY, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}