/** Canonical Apple App Site Association for jov.ie Universal Links. */
export const JOVIE_IOS_APP_ID = 'G24T327LXT.ie.jov.Jovie' as const;

export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    apps: [] as string[],
    details: [
      {
        appID: JOVIE_IOS_APP_ID,
        paths: ['/app/*', '/auth/*'],
      },
    ],
  },
} as const;

export function buildAppleAppSiteAssociationResponse(): Response {
  return new Response(JSON.stringify(APPLE_APP_SITE_ASSOCIATION), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, immutable',
    },
  });
}