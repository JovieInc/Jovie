/**
 * Regression tests for jov.ie AASA routes (JovieInc/Jovie#12709).
 *
 * iOS Universal Links require valid JSON at the canonical
 * /.well-known/apple-app-site-association path.
 */

import { describe, expect, it } from 'vitest';
import {
  APPLE_APP_SITE_ASSOCIATION_DOCUMENT,
  JOVIE_IOS_APP_ID,
} from '@/lib/ios/apple-app-site-association';

const { GET: getWellKnown } = await import(
  '@/app/.well-known/apple-app-site-association/route'
);
const { GET: getLegacyRoot } = await import(
  '@/app/apple-app-site-association/route'
);

async function readAasaResponse(getHandler: () => Response) {
  const response = getHandler();
  const body = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get('Content-Type'),
    cacheControl: response.headers.get('Cache-Control'),
    json: JSON.parse(body) as typeof APPLE_APP_SITE_ASSOCIATION_DOCUMENT,
    rawBody: body,
  };
}

describe('apple-app-site-association routes', () => {
  it.each([
    ['canonical .well-known path', getWellKnown],
    ['legacy root path', getLegacyRoot],
  ])('serves valid AASA JSON on %s', async (_label, getHandler) => {
    const result = await readAasaResponse(getHandler);

    expect(result.status).toBe(200);
    expect(result.contentType).toBe('application/json');
    expect(result.cacheControl).toContain('public');
    expect(result.json).toEqual(APPLE_APP_SITE_ASSOCIATION_DOCUMENT);
    expect(result.rawBody).not.toContain('<html');
  });

  it('includes applinks for the native Jovie iOS app', async () => {
    const { json } = await readAasaResponse(getWellKnown);

    expect(json.applinks.apps).toEqual([]);
    expect(json.applinks.details).toHaveLength(1);
    expect(json.applinks.details[0]?.appID).toBe(JOVIE_IOS_APP_ID);
    expect(json.applinks.details[0]?.paths).toEqual(['/app/*', '/auth/*']);
  });

  it('returns identical bodies from canonical and legacy routes', async () => {
    const wellKnown = await readAasaResponse(getWellKnown);
    const legacy = await readAasaResponse(getLegacyRoot);

    expect(wellKnown.rawBody).toBe(legacy.rawBody);
    expect(wellKnown.json).toEqual(legacy.json);
  });
});