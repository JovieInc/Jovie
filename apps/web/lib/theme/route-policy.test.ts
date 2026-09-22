import { describe, expect, it } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import { isThemeRoute, THEME_ROUTE_POLICY } from './route-policy';

describe('theme route policy', () => {
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
