import { describe, expect, it } from 'vitest';
import { GET as getLegacyAppleAppSiteAssociation } from '@/app/apple-app-site-association/route';
import { GET as getWellKnownAppleAppSiteAssociation } from '@/app/.well-known/apple-app-site-association/route';
import {
  APPLE_APP_SITE_ASSOCIATION,
  JOVIE_IOS_APP_ID,
} from '@/lib/apple-app-site-association';

describe('apple-app-site-association', () => {
  it('declares Universal Link paths for the Jovie iOS app', () => {
    expect(APPLE_APP_SITE_ASSOCIATION.applinks.details).toEqual([
      {
        appID: JOVIE_IOS_APP_ID,
        paths: ['/app/*', '/auth/*'],
      },
    ]);
    expect(APPLE_APP_SITE_ASSOCIATION.applinks.apps).toEqual([]);
  });

  for (const [label, handler] of [
    ['/.well-known/apple-app-site-association', getWellKnownAppleAppSiteAssociation],
    ['/apple-app-site-association', getLegacyAppleAppSiteAssociation],
  ] as const) {
    it(`serves canonical JSON from ${label}`, async () => {
      const response = handler();
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const body = await response.json();
      expect(body).toEqual(APPLE_APP_SITE_ASSOCIATION);
    });
  }
});