import { describe, expect, it } from 'vitest';
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
    ]);

    expect(
      MARKETING_ROUTE_HEALTH_TARGETS.find(
        target => target.glob === 'waitlist/page.tsx'
      )
    ).toMatchObject({
      path: '/waitlist',
      expected: 'page',
      allowsAuthShell: true,
      requiresSharedChrome: false,
    });

    for (const [url, selector] of [
      ['/pay', '[data-testid="pay-hero"]'],
      ['/support', '[data-testid="support-hero"]'],
      ['/waitlist', '#auth-form'],
    ] as const) {
      expect(
        MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.find(target => target.url === url)
      ).toMatchObject({
        fixturePath: url,
        expectedPath: url,
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
        componentPath: 'apps/web/components/features/auth/AuthLayout.tsx',
        sectionId: 'hero',
      }),
      expect.objectContaining({
        componentPath: 'apps/web/components/features/auth/AuthShell.tsx',
        sectionId: 'capture',
      }),
    ]);
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
    for (const entry of MARKETING_ROUTE_MANIFEST) {
      const target = getMarketingRouteHealthTarget(entry);
      if (entry.status === 'active' && !entry.url.includes('*')) {
        expect(
          target.expected,
          `${entry.glob} is active but declares ${target.expected}`
        ).toBe('page');
      }
      if (target.expected === 'not-found') {
        expect(
          entry.url,
          `${entry.glob} declares a not-found probe on a concrete route`
        ).toContain('*');
      }
    }
  });

  it('generates exact capture targets only for active public pages', () => {
    const expectedGlobs = MARKETING_ROUTE_MANIFEST.filter(
      entry =>
        entry.status === 'active' &&
        (entry.healthCheck?.expected ?? 'page') === 'page' &&
        !entry.url.includes('*') &&
        entry.url !== '/renders' &&
        !entry.url.startsWith('/renders/')
    ).map(entry => entry.glob);

    expect(
      MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.map(entry => entry.glob)
    ).toEqual(expectedGlobs);
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
