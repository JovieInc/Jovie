import { describe, expect, it } from 'vitest';
import { GET as getLegacyAasa } from '@/app/apple-app-site-association/route';
import { GET as getWellKnownAasa } from '@/app/.well-known/apple-app-site-association/route';
import {
  APPLE_APP_SITE_ASSOCIATION,
  JOVIE_IOS_BUNDLE_ID,
  JOVIE_IOS_TEAM_ID,
} from '@/lib/ios/apple-app-site-association';

async function readAasaJson(response: Response) {
  const body = await response.text();
  expect(() => JSON.parse(body)).not.toThrow();
  return JSON.parse(body) as typeof APPLE_APP_SITE_ASSOCIATION;
}

describe('Apple App Site Association routes', () => {
  it.each([
    ['canonical .well-known path', getWellKnownAasa],
    ['legacy root path', getLegacyAasa],
  ])('serves valid JSON applinks on the %s', async (_label, handler) => {
    const response = handler();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');

    const json = await readAasaJson(response);
    expect(json).toEqual(APPLE_APP_SITE_ASSOCIATION);
    expect(json.applinks.details[0]?.appID).toBe(
      `${JOVIE_IOS_TEAM_ID}.${JOVIE_IOS_BUNDLE_ID}`
    );
    expect(json.applinks.details[0]?.paths).toEqual(['/app/*', '/auth/*']);
  });

  it('returns identical payloads from both endpoints', async () => {
    const wellKnown = await readAasaJson(getWellKnownAasa());
    const legacy = await readAasaJson(getLegacyAasa());
    expect(wellKnown).toEqual(legacy);
  });

  it('does not return HTML from either endpoint', async () => {
    for (const handler of [getWellKnownAasa, getLegacyAasa]) {
      const body = await handler().text();
      expect(body.trim().startsWith('<')).toBe(false);
      expect(body).not.toContain('<!DOCTYPE');
    }
  });
});