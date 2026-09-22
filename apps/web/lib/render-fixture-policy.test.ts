import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MARKETING_ROUTE_DISPOSITION_LEDGER,
  MARKETING_ROUTE_MANIFEST,
} from '@/data/marketing/routeManifest';
import {
  isProfileModeAliasMarker,
  isRenderFixtureEnabled,
  isRenderFixturePathname,
  PROFILE_MODE_ALIAS_MARKER,
  RENDER_FIXTURE_ADMISSION,
  RENDER_FIXTURE_METADATA,
  RENDER_FIXTURE_X_ROBOTS_TAG,
  type RenderFixtureRouteGlob,
} from '@/lib/render-fixture-policy';
import {
  collectSitemapInventoryViolations,
  isSitemapIndexableMarketingRoute,
} from '@/lib/seo/sitemap-publication';

const webRoot = path.resolve(__dirname, '..');

function read(rel: string): string {
  return readFileSync(path.join(webRoot, rel), 'utf8');
}

const FIXTURE_PAGE_SOURCES: Record<
  Extract<
    RenderFixtureRouteGlob,
    | '/renders'
    | '/renders/[state]'
    | '/renders/profile-admission'
    | '/renders/surfaces/[surface]'
  >,
  string
> = {
  '/renders': 'app/(marketing)/renders/page.tsx',
  '/renders/[state]': 'app/(marketing)/renders/[state]/page.tsx',
  '/renders/profile-admission':
    'app/(marketing)/renders/profile-admission/page.tsx',
  '/renders/surfaces/[surface]':
    'app/(marketing)/renders/surfaces/[surface]/page.tsx',
};

const PROFILE_MODE_RENDER_PAGE =
  'app/[username]/profile-mode-render/[profileMode]/[marker]/page.tsx';

describe('render fixture route contract (JOV-5813)', () => {
  it('classifies every registered fixture glob', () => {
    const samples: Record<RenderFixtureRouteGlob, string> = {
      '/renders': '/renders',
      '/renders/[state]': '/renders/catalog',
      '/renders/profile-admission': '/renders/profile-admission',
      '/renders/surfaces/[surface]': '/renders/surfaces/profile',
      '/{username}/profile-mode-render/{profileMode}/{marker}':
        '/some-handle/profile-mode-render/listen/__profile-mode-alias',
    };
    for (const glob of Object.keys(RENDER_FIXTURE_ADMISSION)) {
      const sample = samples[glob as RenderFixtureRouteGlob];
      expect(sample, `${glob} has a sample path`).toBeTruthy();
      expect(
        isRenderFixturePathname(sample),
        `${glob} resolves through the classifier`
      ).toBe(true);
    }
  });

  it('does not classify public paths as fixtures', () => {
    const publicPaths = [
      '/',
      '/tim',
      '/pricing',
      '/tim/listen',
      '/renders-archive',
      '/profile-mode-render',
      '/a/profile-mode-render',
      '/a/profile-mode-render/listen',
      '/a/profile-mode-render/listen/marker/extra',
    ];
    for (const pathname of publicPaths) {
      expect(isRenderFixturePathname(pathname), pathname).toBe(false);
    }
  });

  it('fails closed in production and when fixture authorization is missing', () => {
    expect(
      isRenderFixtureEnabled({
        VERCEL_ENV: 'production',
        NODE_ENV: 'production',
        NEXT_PUBLIC_E2E_MODE: '1',
        PUBLIC_NOAUTH_SMOKE: '1',
      })
    ).toBe(false);
    expect(isRenderFixtureEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      isRenderFixtureEnabled({
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
      })
    ).toBe(false);
    expect(isRenderFixtureEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('admits a bounded fixture authorization outside production', () => {
    expect(
      isRenderFixtureEnabled({
        NODE_ENV: 'development',
        NEXT_PUBLIC_E2E_MODE: '1',
      })
    ).toBe(true);
    expect(
      isRenderFixtureEnabled({
        CI: 'true',
        NODE_ENV: 'production',
        PUBLIC_NOAUTH_SMOKE: '1',
      })
    ).toBe(true);
    expect(
      isRenderFixtureEnabled({
        VERCEL_ENV: 'preview',
        NODE_ENV: 'production',
        CI: 'true',
        NEXT_PUBLIC_E2E_MODE: '1',
      })
    ).toBe(true);
  });

  it('marks fixture metadata and robots tag non-indexable', () => {
    expect(RENDER_FIXTURE_METADATA.robots).toMatchObject({
      index: false,
      follow: false,
    });
    expect(RENDER_FIXTURE_X_ROBOTS_TAG).toContain('noindex');
  });

  it('gates every env-authorized fixture page through the shared contract', () => {
    for (const [glob, file] of Object.entries(FIXTURE_PAGE_SOURCES)) {
      const source = read(file);
      expect(source, glob).toContain('isRenderFixtureEnabled()');
      expect(source, glob).toContain('notFound()');
      expect(source, glob).toContain('RENDER_FIXTURE_METADATA');
    }
  });

  it('keeps fixture pages free of scattered env checks', () => {
    for (const [glob, file] of Object.entries(FIXTURE_PAGE_SOURCES)) {
      const source = read(file);
      expect(source, glob).not.toMatch(/process\.env\./);
      expect(source, glob).not.toMatch(
        /VERCEL_ENV|NEXT_PUBLIC_E2E_MODE|PUBLIC_NOAUTH_SMOKE/
      );
    }
  });

  it('admits only the private marker on the profile-mode render destination', () => {
    expect(isProfileModeAliasMarker(PROFILE_MODE_ALIAS_MARKER)).toBe(true);
    expect(isProfileModeAliasMarker('listen')).toBe(false);

    const source = read(PROFILE_MODE_RENDER_PAGE);
    expect(source).toContain('PROFILE_MODE_ALIAS_MARKER');
    expect(source).toContain('notFound()');
    // Internal render destinations stay non-indexable even when reachable.
    expect(source).toContain('RENDER_FIXTURE_METADATA');
  });

  it('emits X-Robots-Tag noindex for fixture paths at the HTTP layer', () => {
    const config = read('next.config.js');
    expect(config).toContain("'/renders/:path*'");
    expect(config).toContain('profile-mode-render/:path*');
    expect(config).toContain(`value: '${RENDER_FIXTURE_X_ROBOTS_TAG}'`);
    expect(config).toContain(PROFILE_MODE_ALIAS_MARKER);

    const proxy = read('proxy.ts');
    expect(proxy).toContain(PROFILE_MODE_ALIAS_MARKER);
  });

  it('keeps fixture routes out of robots allowances and the sitemap', () => {
    const robots = read('app/robots.ts');
    expect(robots).toContain("'/renders/'");

    const fixtureUrls = [
      '/renders',
      '/renders/catalog',
      '/renders/profile-admission',
      '/renders/surfaces/profile',
    ];
    for (const url of fixtureUrls) {
      expect(isSitemapIndexableMarketingRoute({ url, status: 'active' })).toBe(
        false
      );
      expect(
        collectSitemapInventoryViolations([{ url: `https://jov.ie${url}` }])
      ).toContain(`private or fixture url included: ${url}`);
    }
  });

  it('registers every renders glob as internal in the route manifest ledger', () => {
    const ledger = new Map(
      MARKETING_ROUTE_DISPOSITION_LEDGER.map(entry => [entry.key, entry])
    );
    const manifestGlobs = [
      '(marketing)/renders/page.tsx',
      '(marketing)/renders/[state]/page.tsx',
      '(marketing)/renders/profile-admission/page.tsx',
      '(marketing)/renders/surfaces/[surface]/page.tsx',
    ];
    for (const glob of manifestGlobs) {
      const entry = ledger.get(glob);
      expect(entry, glob).toBeTruthy();
      expect(entry?.disposition, glob).toBe('internal');
    }

    for (const entry of MARKETING_ROUTE_MANIFEST) {
      if (isRenderFixturePathname(entry.url)) {
        expect(entry.url, entry.glob).toMatch(/^\/renders/);
      }
    }
  });
});
