import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  getMarketingRouteHealthTarget,
  getRouteManifestEntry,
  getRouteRecipeParity,
  isExempt,
  isRecipeRoute,
  MARKETING_EXACT_PUBLIC_ROUTE_TARGETS,
  MARKETING_ROUTE_DISPOSITION_LEDGER,
  MARKETING_ROUTE_HEALTH_TARGETS,
  MARKETING_ROUTE_MANIFEST,
} from '@/data/marketing';
import { getMarketingExactPublicRouteTargets } from '@/data/marketing/routeManifest';
import { isProductionBlockedDebugPath } from '@/lib/security/production-blocked-routes';

const PRODUCT_UPDATE_OWNER =
  'apps/web/app/(marketing)/changelog/ChangelogEmailSignup.tsx';

function signupPages(): readonly string[] {
  const source = readFileSync(
    resolve(process.cwd(), 'components/marketing/MarketingEmailSignup.tsx'),
    'utf8'
  );
  const block = source.match(/const SIGNUP_PAGES = new Set\(\[([\s\S]*?)\]\)/);
  if (!block?.[1]) throw new Error('SIGNUP_PAGES is missing');
  return [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1] ?? '');
}

describe('marketing route health contract', () => {
  it('registers the generated integrations directory as a sanctioned reference route', () => {
    const entry = getRouteManifestEntry('(marketing)/integrations/page.tsx');
    expect(entry).toMatchObject({
      url: '/integrations',
      status: 'active',
      exempt: {
        linearId: 'JOV-8012',
        approvedBy: 'tw',
        prUrl: 'https://github.com/JovieInc/Jovie/pull/20958',
      },
    });
    expect(getMarketingRouteHealthTarget(entry!)).toMatchObject({
      path: '/integrations',
      expected: 'page',
    });
  });
  it('keeps the retired /new alias bound to the live homepage redirect', () => {
    const alias = MARKETING_ROUTE_MANIFEST.find(entry => entry.url === '/new');
    expect(alias).toMatchObject({
      status: 'deprecated',
      noindex: true,
      aliasOf: '/',
      renderedSections: [],
      bindingEvidence: { status: 'unverified' },
    });
    expect(getMarketingRouteHealthTarget(alias!)).toMatchObject({
      path: '/new',
      expected: 'redirect',
      allowedFinalPaths: ['/'],
    });
    expect(
      MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.some(target => target.url === '/new')
    ).toBe(false);
  });

  it('has one concrete target per manifest entry', () => {
    expect(MARKETING_ROUTE_HEALTH_TARGETS).toHaveLength(
      MARKETING_ROUTE_MANIFEST.length
    );
    const globs = MARKETING_ROUTE_HEALTH_TARGETS.map(target => target.glob);
    expect(new Set(globs).size).toBe(MARKETING_ROUTE_MANIFEST.length);
    for (const target of MARKETING_ROUTE_HEALTH_TARGETS) {
      expect(target.path, `${target.glob} has a wildcard path`).not.toContain(
        '*'
      );
      expect(target.path, `${target.glob} needs an absolute path`).toMatch(
        /^\//
      );
    }
  });

  it('fails closed for wildcard routes and undeclared redirects', () => {
    expect(() =>
      getMarketingRouteHealthTarget({
        ...MARKETING_ROUTE_MANIFEST[0],
        glob: '(marketing)/future/[slug]/page.tsx',
        url: '/future/*',
        healthCheck: undefined,
      })
    ).toThrow(/concrete healthCheck\.path/);
    expect(() =>
      getMarketingRouteHealthTarget({
        ...MARKETING_ROUTE_MANIFEST[0],
        glob: 'waitlist/page.tsx',
        url: '/waitlist',
        healthCheck: { path: '/waitlist', expected: 'redirect' },
      })
    ).toThrow(/without an allowed final path/);
    expect(() =>
      getMarketingRouteHealthTarget({
        ...MARKETING_ROUTE_MANIFEST[0],
        glob: '(marketing)/future/page.tsx',
        url: 'future',
        healthCheck: undefined,
      })
    ).toThrow(/concrete absolute path/);
  });

  it('rejects relative and wildcard redirect destinations before browser admission', () => {
    for (const finalPath of ['login', '/future/*']) {
      expect(() =>
        getMarketingRouteHealthTarget({
          ...MARKETING_ROUTE_MANIFEST[0],
          healthCheck: {
            path: '/legacy',
            expected: 'redirect',
            allowedFinalPaths: [finalPath],
          },
        })
      ).toThrow(/invalid redirect target/);
    }
    expect(
      getMarketingRouteHealthTarget({
        ...MARKETING_ROUTE_MANIFEST[0],
        healthCheck: {
          path: '/legacy',
          expected: 'redirect',
          allowedFinalPaths: ['/pricing'],
        },
      })
    ).toMatchObject({ expected: 'redirect', allowedFinalPaths: ['/pricing'] });
  });

  it('returns real route ownership and fails closed for unknown source paths', () => {
    const pricing = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/pricing'
    );
    const developers = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/developers'
    );
    expect(pricing).toBeDefined();
    expect(developers).toBeDefined();
    expect(getRouteManifestEntry(pricing!.glob)).toBe(pricing);
    expect(isRecipeRoute(pricing!.glob)).toBe(true);
    expect(isExempt(pricing!.glob)).toBe(false);
    expect(isExempt(developers!.glob)).toBe(true);
    expect(isRecipeRoute(developers!.glob)).toBe(false);
    expect(
      getRouteManifestEntry('(marketing)/unregistered/page.tsx')
    ).toBeNull();
    expect(isExempt('(marketing)/unregistered/page.tsx')).toBe(false);
    expect(isRecipeRoute('(marketing)/unregistered/page.tsx')).toBe(false);
  });

  it('never projects an unverified or non-recipe binding as matching recipe proof', () => {
    const pricing = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/pricing'
    )!;
    expect(
      getRouteRecipeParity({
        ...pricing,
        bindingEvidence: { ...pricing.bindingEvidence, status: 'unverified' },
      })
    ).toMatchObject({ evidenceStatus: 'unverified', matches: null });
    const developers = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/developers'
    )!;
    expect(getRouteRecipeParity(developers)).toMatchObject({
      expectedSectionIds: [],
      matches: null,
    });
    expect(getRouteRecipeParity(pricing).matches).toBe(false);
  });

  it.each([false, true])(
    'keeps demo route disposition aligned with video availability %s',
    async enabled => {
      vi.resetModules();
      vi.doMock('@/lib/flags/marketing-static', async importOriginal => {
        const original =
          await importOriginal<typeof import('@/lib/flags/marketing-static')>();
        return {
          ...original,
          FEATURE_FLAGS: {
            ...original.FEATURE_FLAGS,
            SHOW_PRODUCT_DEMO_VIDEO: enabled,
          },
        };
      });
      try {
        const manifest = await import('@/data/marketing/routeManifest');
        const { sweepTargets } = await import('@/lib/seo/seo-certify-sweep');
        const swept = sweepTargets(manifest.MARKETING_ROUTE_MANIFEST).map(
          target => target.pathname
        );
        expect(swept).toContain('/product');
        for (const path of ['/demo/video', '/demovideo']) {
          const entry = manifest.MARKETING_ROUTE_MANIFEST.find(
            entry => entry.url === path
          )!;
          expect(swept.includes(path)).toBe(enabled);
          expect(manifest.getMarketingRouteHealthTarget(entry)).toMatchObject({
            path,
            expected: enabled ? 'page' : 'redirect',
            allowedFinalPaths: enabled ? [] : ['/product'],
          });
        }
      } finally {
        vi.doUnmock('@/lib/flags/marketing-static');
        vi.resetModules();
      }
    }
  );

  it('tracks intentional redirects and keeps public pages renderable', () => {
    const redirects = MARKETING_ROUTE_HEALTH_TARGETS.filter(
      target => target.expected === 'redirect'
    );
    expect(redirects).toEqual([
      {
        glob: '(marketing)/new/page.tsx',
        path: '/new',
        expected: 'redirect',
        allowedFinalPaths: ['/'],
        allowsAuthShell: false,
        requiresSharedChrome: true,
      },
      {
        glob: '(marketing)/artist-profile/page.tsx',
        path: '/artist-profile',
        expected: 'redirect',
        allowedFinalPaths: ['/artist-profiles'],
        allowsAuthShell: false,
        requiresSharedChrome: false,
      },
      {
        glob: 'waitlist/page.tsx',
        path: '/waitlist',
        expected: 'redirect',
        allowedFinalPaths: ['/start'],
        allowsAuthShell: true,
        requiresSharedChrome: false,
      },
      ...['/demo/video', '/demovideo'].map(path => ({
        glob: `(marketing)${path}/page.tsx`,
        path,
        expected: 'redirect',
        allowedFinalPaths: ['/product'],
        allowsAuthShell: false,
        requiresSharedChrome: false,
      })),
    ]);

    expect(
      MARKETING_ROUTE_HEALTH_TARGETS.find(
        target => target.glob === 'waitlist/page.tsx'
      )
    ).toMatchObject({
      path: '/waitlist',
      expected: 'redirect',
      allowedFinalPaths: ['/start'],
      allowsAuthShell: true,
      requiresSharedChrome: false,
    });

    for (const [url, selector, finalPath] of [
      ['/pay', '[data-testid="pay-hero"]', '/pay'],
      ['/support', '[data-testid="marketing-section-hero"]', '/support'],
      // One front door: /waitlist capture follows the redirect to /start.
      ['/waitlist', '[data-testid="onboarding-chat"]', '/start'],
    ] as const) {
      expect(
        MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.find(target => target.url === url)
      ).toMatchObject({
        fixturePath: url,
        expectedPath: finalPath,
        expectedRuntimeSelector: selector,
        sourceSha: 'capture-time-git-sha',
        viewports: ['desktop', 'mobile'],
      });
    }

    const waitlist = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/waitlist'
    );
    expect(waitlist?.renderedSections).toEqual([
      expect.objectContaining({
        componentPath: 'apps/web/components/features/auth/AuthShell.tsx',
        sectionId: 'capture',
        variantId: 'email-only',
      }),
    ]);
  });

  it('records the shared product-update section on censused signup pages', () => {
    const missing: string[] = [];
    for (const url of signupPages()) {
      const entry = MARKETING_ROUTE_MANIFEST.find(item => item.url === url);
      expect(entry, url).toBeDefined();
      if (!entry) continue;
      const target = getMarketingRouteHealthTarget(entry);
      if (target.expected !== 'page') continue;
      if (entry.exempt && entry.renderedSections.length === 0) continue;
      const last = entry.renderedSections.at(-1);
      const recorded =
        last?.kind === 'approved-section' &&
        last.sectionId === 'capture' &&
        last.variantId === 'email-only' &&
        last.occurrenceId === 'product-updates' &&
        last.componentPath === PRODUCT_UPDATE_OWNER;
      if (!recorded) missing.push(url);
    }
    expect(missing).toEqual([]);
  });

  it('generates one disposition inventory from the canonical route manifest', () => {
    expect(MARKETING_ROUTE_DISPOSITION_LEDGER).toHaveLength(
      MARKETING_ROUTE_MANIFEST.length
    );
    expect(MARKETING_ROUTE_DISPOSITION_LEDGER.map(entry => entry.key)).toEqual(
      MARKETING_ROUTE_MANIFEST.map(entry => entry.glob)
    );
    expect(
      MARKETING_ROUTE_DISPOSITION_LEDGER.find(entry => entry.url === '/ai')
        ?.disposition
    ).toBe('noindex');
    expect(
      MARKETING_ROUTE_DISPOSITION_LEDGER.find(entry => entry.url === '/renders')
        ?.disposition
    ).toBe('internal');
    expect(
      MARKETING_ROUTE_DISPOSITION_LEDGER.find(
        entry => entry.url === '/developers'
      )?.disposition
    ).toBe('explicit-exempt');
    expect(
      MARKETING_ROUTE_DISPOSITION_LEDGER.filter(
        entry => entry.disposition === 'unknown'
      )
    ).toEqual([]);
  });

  it('serves a page for every active manifest route with a concrete URL', () => {
    // JOV-6859: an active route must never silently 404 — its resolved health
    // target cannot be declared not-found. Wildcard routes keep their explicit
    // fixture probes (e.g. the unpublished engineering article check).
    // Development-only routes that the proxy blocks in production are the
    // one exception: they must declare not-found (never a certified page).
    for (const entry of MARKETING_ROUTE_MANIFEST) {
      const target = getMarketingRouteHealthTarget(entry);
      const productionBlocked = isProductionBlockedDebugPath(target.path);
      if (entry.status === 'active' && target.expected === 'redirect') {
        expect(target.allowedFinalPaths.length).toBeGreaterThan(0);
        for (const path of target.allowedFinalPaths) {
          // One front door (Tim, 2026-11-09): a redirect may declare an
          // app-route destination outside this manifest
          // (healthCheck.destinationIsAppRoute, e.g. /start — certified by
          // the canaries + claim dogfood). Undeclared destinations must
          // still be canonical active pages.
          if (entry.healthCheck?.destinationIsAppRoute === true) {
            expect(path.startsWith('/'), path).toBe(true);
            continue;
          }
          const destination = MARKETING_ROUTE_MANIFEST.find(
            entry => entry.url === path
          );
          expect(destination?.status).toBe('active');
          expect(getMarketingRouteHealthTarget(destination!).expected).toBe(
            'page'
          );
        }
        continue;
      }
      if (entry.status === 'active' && !entry.url.includes('*')) {
        expect(
          target.expected,
          `${entry.glob} is active but declares ${target.expected}`
        ).toBe(productionBlocked ? 'not-found' : 'page');
      }
      if (target.expected === 'not-found' && !productionBlocked) {
        expect(
          entry.url,
          `${entry.glob} declares a not-found probe on a concrete route`
        ).toContain('*');
      }
    }
  });

  it('generates exact captures for active pages and source-bound demo recoveries', () => {
    const expectedGlobs = MARKETING_ROUTE_MANIFEST.filter(
      entry =>
        entry.status === 'active' &&
        ((entry.healthCheck?.expected ?? 'page') === 'page' ||
          // Declared app-route recoveries (/waitlist -> /start) are captured.
          entry.healthCheck?.destinationIsAppRoute === true) &&
        !entry.url.includes('*') &&
        entry.url !== '/renders' &&
        !entry.url.startsWith('/renders/')
    ).map(entry => entry.glob);

    expect(
      MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.map(entry => entry.glob).sort()
    ).toEqual(
      [
        ...expectedGlobs,
        '(marketing)/demo/video/page.tsx',
        '(marketing)/demovideo/page.tsx',
      ].sort()
    );
    for (const path of ['/demo/video', '/demovideo']) {
      expect(
        MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.find(target => target.url === path)
      ).toMatchObject({
        fixturePath: path,
        expectedPath: '/product',
        sourcePath: `apps/web/app/(marketing)${path}/page.tsx`,
      });
    }
  });

  it('excludes ambiguous, malformed and unavailable redirect capture targets', () => {
    const alias = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/demo/video'
    )!;
    const product = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product'
    )!;
    for (const destinations of [
      [],
      ['/product', '/pricing'],
      ['//evil.example/product'],
      ['https://evil.example/product'],
      ['/product?x=1'],
      ['/product#x'],
      ['/a/../product'],
      ['/missing'],
      ['/renders'],
    ]) {
      expect(
        getMarketingExactPublicRouteTargets([
          {
            ...alias,
            healthCheck: {
              path: alias.url,
              expected: 'redirect',
              allowedFinalPaths: destinations,
            },
          },
          product,
        ]).some(target => target.url === alias.url),
        destinations.join(',')
      ).toBe(false);
    }
    for (const entry of [
      { ...alias, status: 'deprecated' as const },
      {
        ...alias,
        healthCheck: { path: alias.url, expected: 'not-found' as const },
      },
    ]) {
      expect(
        getMarketingExactPublicRouteTargets([entry, product]).some(
          target => target.url === alias.url
        )
      ).toBe(false);
    }
    for (const target of [
      { ...product, status: 'removed' as const },
      {
        ...product,
        healthCheck: {
          path: '/product',
          expected: 'redirect' as const,
          allowedFinalPaths: ['/pricing'],
        },
      },
    ]) {
      expect(
        getMarketingExactPublicRouteTargets([alias, target]).some(
          target => target.url === alias.url
        )
      ).toBe(false);
    }
  });

  it('records an exact not-found probe when no published dynamic fixture exists', () => {
    expect(
      MARKETING_ROUTE_HEALTH_TARGETS.find(
        target => target.glob === '(marketing)/engineering/[slug]/page.tsx'
      )
    ).toMatchObject({
      path: '/engineering/verified-changelog',
      expected: 'not-found',
      requiresSharedChrome: false,
    });
  });
});
