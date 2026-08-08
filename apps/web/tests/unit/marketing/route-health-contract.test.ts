import { describe, expect, it } from 'vitest';
import {
  getMarketingRouteHealthTarget,
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

  it('only permits the explicit waitlist redirect', () => {
    const redirects = MARKETING_ROUTE_HEALTH_TARGETS.filter(
      target => target.expected === 'redirect'
    );
    expect(redirects.map(target => target.glob)).toEqual(['waitlist/page.tsx']);
    expect(redirects[0]?.allowedFinalPaths).toEqual(['/start']);
  });
});
