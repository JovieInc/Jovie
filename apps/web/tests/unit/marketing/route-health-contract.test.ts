import { describe, expect, it } from 'vitest';
import {
  getMarketingRouteHealthTarget,
  MARKETING_EXACT_PUBLIC_ROUTE_TARGETS,
  MARKETING_ROUTE_DISPOSITION_LEDGER,
  MARKETING_ROUTE_HEALTH_TARGETS,
  MARKETING_ROUTE_MANIFEST,
} from '@/data/marketing';

describe('marketing route health contract', () => {
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
      })
    ).toThrow(/concrete absolute path/);
  });

  it('keeps pay, support, and the public waitlist source-bound and renderable', () => {
    const redirects = MARKETING_ROUTE_HEALTH_TARGETS.filter(
      target => target.expected === 'redirect'
    );
    expect(redirects).toEqual([]);

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
