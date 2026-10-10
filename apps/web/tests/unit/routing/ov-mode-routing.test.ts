import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { importNextConfig } from '../../lib/next-config-import';

interface RouteRule {
  readonly source: string;
  readonly destination: string;
  readonly permanent?: boolean;
  readonly missing?: readonly {
    readonly type: string;
    readonly key: string;
    readonly value?: string;
  }[];
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
    expect(
      adminRoutes.every(
        route => route.startsWith(APP_ROUTES.OV) || route === APP_ROUTES.HUD
      )
    ).toBe(true);
    expect(APP_ROUTES.ADMIN_OPS).toBe(APP_ROUTES.HUD);
  });

  it('redirects all legacy admin URLs to the matching OV URL', async () => {
    const nextConfigModule = await importNextConfig();
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = (await nextConfig.redirects()) as RouteRule[];

    expect(redirects).toContainEqual({
      source: `${APP_ROUTES.LEGACY_ADMIN}/:path*`,
      destination: `${APP_ROUTES.OV}/:path*`,
      permanent: false,
    });
  });

  it('aliases every OV path to the existing admin implementation tree', async () => {
    const nextConfigModule = await importNextConfig();
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const rewrites = flattenRewrites(await nextConfig.rewrites());

    expect(rewrites).toContainEqual({
      source: `${APP_ROUTES.OV}/:path*`,
      destination: `${APP_ROUTES.LEGACY_ADMIN}/:path*`,
    });
  });

  it('rewrites /hud and wiki into the OV app shell except token kiosk mode', async () => {
    const nextConfigModule = await importNextConfig();
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const grouped = (await nextConfig.rewrites()) as {
      readonly beforeFiles?: readonly RouteRule[];
      readonly afterFiles?: readonly RouteRule[];
    };
    const hudInShell = {
      source: APP_ROUTES.HUD,
      // fs=1 (JOV-7126): the hud-isolated screen-cert producer's own path to
      // the isolated apps/web/app/hud/page.tsx source. See
      // tests/unit/routing/hud-rewrite-exemptions.test.ts for the dedicated
      // contract test on this rewrite's exemption set.
      missing: [
        { type: 'query', key: 'fs', value: '1' },
        { type: 'query', key: 'kiosk' },
        { type: 'query', key: 'mode', value: 'kiosk' },
      ],
      destination: `${APP_ROUTES.OV}/hud`,
    };

    // Must be beforeFiles. afterFiles loses to the filesystem /hud page and
    // keeps the chrome-less isolated screen.
    expect(grouped.beforeFiles).toContainEqual(hudInShell);
    expect(grouped.afterFiles ?? []).not.toContainEqual(hudInShell);
    expect(grouped.beforeFiles).toContainEqual({
      source: '/hud/wiki/:path*',
      destination: '/app/ov/wiki/:path*',
    });
  });
});
