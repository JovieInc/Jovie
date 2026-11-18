import { createRequire } from 'node:module';
import type { NextConfig } from 'next';
import { beforeAll, describe, expect, it } from 'vitest';

/** The subset of Next's `headers()` rule shape these assertions read. */
interface HeaderRule {
  readonly source: string;
  readonly headers: ReadonlyArray<{
    readonly key: string;
    readonly value: string;
  }>;
}

const NO_STORE = 'private, no-cache, no-store, must-revalidate';
const REVALIDATE = 'public, max-age=0, must-revalidate';

const require = createRequire(import.meta.url);
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (source: string) => RegExp;
};

let rules: HeaderRule[] = [];
let experimental: NonNullable<NextConfig['experimental']> = {};
let baseConfig: NextConfig = {};

/**
 * Next applies every matching rule in declaration order; for one header key
 * the last matching rule wins. This resolves what next.config.js alone would
 * send for a path (a route's own header still overrides it at runtime).
 */
function effectiveHeader(pathname: string, key: string): string | undefined {
  let value: string | undefined;
  for (const rule of rules) {
    if (!pathToRegexp(rule.source).test(pathname)) continue;
    for (const header of rule.headers) {
      if (header.key.toLowerCase() === key.toLowerCase()) value = header.value;
    }
  }
  return value;
}

beforeAll(async () => {
  const nextConfigModule = await import('../../../next.config.js');
  const nextConfig: NextConfig = nextConfigModule.default ?? nextConfigModule;
  if (!nextConfig.headers)
    throw new Error('next.config.js must define headers()');
  rules = await nextConfig.headers();
  experimental = nextConfig.experimental ?? {};
  baseConfig = nextConfig;
}, 60_000);

describe('next.config.js Cache-Control rules', () => {
  it('declares the public catch-all first so private rules override it', () => {
    expect(rules[0]?.source).toBe('/(.*)');
    expect(rules.filter(rule => rule.source === '/(.*)')).toHaveLength(1);
  });

  it.each([
    '/api/anything',
    '/api/auth/get-session',
    '/api/dashboard/profile',
    '/api/profile-alias-decision',
  ])('defaults %s to no-store when the handler sets nothing', pathname => {
    expect(effectiveHeader(pathname, 'Cache-Control')).toBe(NO_STORE);
  });

  it('keeps CDN-level no-store on the health and billing receipts', () => {
    for (const pathname of [
      '/api/health',
      '/api/health/build-info',
      '/api/billing/health',
    ]) {
      expect(effectiveHeader(pathname, 'Cache-Control')).toBe(NO_STORE);
      expect(effectiveHeader(pathname, 'CDN-Cache-Control')).toBe('no-store');
      expect(effectiveHeader(pathname, 'Vercel-CDN-Cache-Control')).toBe(
        'no-store'
      );
    }
  });

  it('never declares a shared-cache lifetime or immutable in any rule', () => {
    const values = rules.flatMap(rule =>
      rule.headers
        .filter(header => header.key.toLowerCase() === 'cache-control')
        .map(header => header.value)
    );
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).not.toMatch(/s-maxage/);
      expect(value).not.toMatch(/immutable/);
    }
  });

  it.each([
    '/app',
    '/app/settings/account',
    '/account',
    '/account/delete',
    '/billing',
    '/billing/success',
    '/onboarding',
    '/go/abc',
    '/r/abc',
    '/hud',
    '/hud-tv',
    '/signin',
    '/signup',
    '/sso-callback',
    '/investor-portal',
    '/investor-portal/deck',
  ])('keeps %s no-store after the catch-all', pathname => {
    expect(effectiveHeader(pathname, 'Cache-Control')).toBe(NO_STORE);
  });

  it.each([
    '/',
    '/pricing',
    '/support',
    '/blog',
    '/changelog',
    '/engagement-engine',
    '/legal/privacy',
    '/tim',
    '/tim/listen',
    // Prefix look-alikes of the private sections must stay public.
    '/robots.txt',
    '/report',
    '/rihanna',
    '/gorillaz',
    '/accountant',
    '/signing',
  ])('revalidates public path %s', pathname => {
    expect(effectiveHeader(pathname, 'Cache-Control')).toBe(REVALIDATE);
  });

  it('sends the security headers on every path', () => {
    for (const pathname of ['/', '/tim', '/app', '/api/x', '/pricing']) {
      expect(effectiveHeader(pathname, 'X-Frame-Options')).toBe('DENY');
      expect(effectiveHeader(pathname, 'X-Content-Type-Options')).toBe(
        'nosniff'
      );
    }
  });
});

describe('next.config.js default hygiene', () => {
  it('lists no optimizePackageImports entry that Next already optimizes or that is not installed', () => {
    const optimized = experimental.optimizePackageImports ?? [];
    expect(optimized).toContain('@jovie/ui');
    for (const redundant of [
      'lucide-react',
      '@headlessui/react',
      'recharts',
      'simple-icons',
    ]) {
      expect(optimized).not.toContain(redundant);
    }
  });

  it('does not restate Next 16.4 defaults', () => {
    expect(experimental).not.toHaveProperty('turbopackFileSystemCacheForDev');
    expect(experimental).not.toHaveProperty('swcTraceProfiling');
    expect(baseConfig.images).not.toHaveProperty('unoptimized');
  });
});
