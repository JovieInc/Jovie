import { describe, expect, it } from 'vitest';
import { GET as getWellKnown } from '@/app/.well-known/apple-app-site-association/route';
import { GET as getLegacy } from '@/app/apple-app-site-association/route';
import {
  JOVIE_APPLE_APP_SITE_ASSOCIATION,
  JOVIE_APPLE_TEAM_ID,
  JOVIE_IOS_BUNDLE_ID,
} from '@/lib/ios/apple-app-site-association';

async function readAasaResponse(response: Response) {
  const body = await response.json();
  const contentType = response.headers.get('content-type') ?? '';
  return { body, contentType, status: response.status };
}

describe('apple-app-site-association routes', () => {
  it('canonical payload includes ie.jov.Jovie applinks for /app/* and /auth/*', () => {
    expect(JOVIE_APPLE_APP_SITE_ASSOCIATION.applinks.apps).toEqual([]);
    expect(JOVIE_APPLE_APP_SITE_ASSOCIATION.applinks.details).toEqual([
      {
        appID: `${JOVIE_APPLE_TEAM_ID}.${JOVIE_IOS_BUNDLE_ID}`,
        paths: ['/app/*', '/auth/*'],
      },
    ]);
  });

  it.each([
    ['/.well-known/apple-app-site-association', getWellKnown],
    ['/apple-app-site-association', getLegacy],
  ] as const)('%s returns JSON AASA with 200', async (_path, handler) => {
    const { body, contentType, status } = await readAasaResponse(handler());

    expect(status).toBe(200);
    expect(contentType).toContain('application/json');
    expect(body).toEqual(JOVIE_APPLE_APP_SITE_ASSOCIATION);
  });

  it('well-known and legacy routes return identical bodies', async () => {
    const [wellKnown, legacy] = await Promise.all([
      readAasaResponse(getWellKnown()),
      readAasaResponse(getLegacy()),
    ]);

    expect(wellKnown.body).toEqual(legacy.body);
    expect(wellKnown.status).toBe(legacy.status);
  });
});
