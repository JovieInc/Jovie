import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';

async function loadPolicy() {
  vi.resetModules();
  return import('./route-policy');
}

describe('theme route policy with THEME_SWITCHING off (default)', () => {
  it.each(['/', '/pricing', '/app', '/app/settings', '/blog/entry', '/tim'])(
    'forces dark on %s',
    async pathname => {
      const { isThemeRoute, THEME_ROUTE_POLICY } = await loadPolicy();
      expect(THEME_ROUTE_POLICY).toEqual({ exact: [], prefixes: [] });
      expect(isThemeRoute(pathname)).toBe(false);
    }
  );
});

describe('theme route policy with THEME_SWITCHING on', () => {
  let isThemeRoute: (pathname: string) => boolean;
  let THEME_ROUTE_POLICY: unknown;

  beforeAll(async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_THEME_SWITCHING', '1');
    ({ isThemeRoute, THEME_ROUTE_POLICY } = await loadPolicy());
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('is serializable for the synchronous root-layout bootstrap', () => {
    expect(JSON.parse(JSON.stringify(THEME_ROUTE_POLICY))).toEqual(
      THEME_ROUTE_POLICY
    );
  });

  it.each([
    '/',
    '/about',
    '/card',
    '/blog/entry',
    '/changelog/v2',
    '/engineering/preview/story',
    '/compare/cursor',
    '/alternatives/linear',
    '/renders/profile-admission',
  ])('accepts declared marketing path %s', pathname => {
    expect(isThemeRoute(pathname)).toBe(true);
  });

  it('covers every active public route in the marketing manifest', () => {
    const activeManifestPaths = MARKETING_ROUTE_MANIFEST.filter(
      entry => entry.status === 'active'
    ).map(entry => entry.url.replace(/\/\*$/u, '/__theme_route_fixture__'));

    for (const pathname of activeManifestPaths) {
      expect(isThemeRoute(pathname), pathname).toBe(true);
    }
  });

  it.each([
    '/pricing-extra',
    '/blogroll',
    '/artistname',
    '/artistname/about',
    '/playlists',
    '/brand',
    '/pitch',
    '/demo',
  ])('rejects an unrelated or lookalike path %s', pathname => {
    expect(isThemeRoute(pathname)).toBe(false);
  });
});
