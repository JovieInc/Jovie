import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

interface RouteRule {
  readonly source: string;
  readonly destination: string;
  readonly permanent?: boolean;
}

function flattenRewrites(
  rewrites:
    | RouteRule[]
    | {
        readonly beforeFiles?: readonly RouteRule[];
        readonly afterFiles?: readonly RouteRule[];
        readonly fallback?: readonly RouteRule[];
      }
): readonly RouteRule[] {
  if (Array.isArray(rewrites)) return rewrites;

  return [
    ...(rewrites.beforeFiles ?? []),
    ...(rewrites.afterFiles ?? []),
    ...(rewrites.fallback ?? []),
  ];
}

describe('OV mode routing', () => {
  it('keeps the legacy feature-flags path redirect-only', () => {
    expect(APP_ROUTES.LEGACY_FEATURE_FLAGS).toBe('/app/feature-flags');
    expect(APP_ROUTES.ADMIN_FEATURES).toBe('/app/ov/features');
  });

  it('makes OV the canonical location for every named admin page', () => {
    const adminRoutes = Object.entries(APP_ROUTES)
      .filter(([key]) => key === 'ADMIN' || key.startsWith('ADMIN_'))
      .map(([, route]) => route);

    expect(APP_ROUTES.OV).toBe('/app/ov');
    expect(APP_ROUTES.LEGACY_ADMIN).toBe('/app/admin');
    expect(adminRoutes.length).toBeGreaterThan(20);
    expect(adminRoutes.every(route => route.startsWith(APP_ROUTES.OV))).toBe(
      true
    );
  });

  it('redirects all legacy admin URLs to the matching OV URL', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = (await nextConfig.redirects()) as RouteRule[];

    expect(redirects).toContainEqual({
      source: `${APP_ROUTES.LEGACY_ADMIN}/:path*`,
      destination: `${APP_ROUTES.OV}/:path*`,
      permanent: false,
    });
  });

  it('aliases every OV path to the existing admin implementation tree', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const rewrites = flattenRewrites(await nextConfig.rewrites());

    expect(rewrites).toContainEqual({
      source: `${APP_ROUTES.OV}/:path*`,
      destination: `${APP_ROUTES.LEGACY_ADMIN}/:path*`,
    });
  });
});
