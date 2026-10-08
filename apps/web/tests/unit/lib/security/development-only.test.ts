import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_SCREENSHOT_CAPTURE_PAGE_PATHS } from '@/lib/security/production-blocked-routes';

describe('development-only security helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isExplicitDevelopmentEnvironment', () => {
    it('returns true when NODE_ENV is development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('VERCEL_ENV', '');

      const { isExplicitDevelopmentEnvironment } = await import(
        '@/lib/security/development-only'
      );

      expect(isExplicitDevelopmentEnvironment()).toBe(true);
    });

    it('returns true when VERCEL_ENV is development', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('VERCEL_ENV', 'development');

      const { isExplicitDevelopmentEnvironment } = await import(
        '@/lib/security/development-only'
      );

      expect(isExplicitDevelopmentEnvironment()).toBe(true);
    });

    it('returns false on Vercel preview deployments', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VERCEL_ENV', 'preview');

      const { isExplicitDevelopmentEnvironment } = await import(
        '@/lib/security/development-only'
      );

      expect(isExplicitDevelopmentEnvironment()).toBe(false);
    });

    it('returns false on Vercel production deployments', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VERCEL_ENV', 'production');

      const { isExplicitDevelopmentEnvironment } = await import(
        '@/lib/security/development-only'
      );

      expect(isExplicitDevelopmentEnvironment()).toBe(false);
    });
  });

  describe('developmentOnlyForbiddenJson', () => {
    it('returns a 403 JSON payload with the shared error copy', async () => {
      const { developmentOnlyForbiddenJson, DEVELOPMENT_ONLY_ERROR } =
        await import('@/lib/security/development-only');

      const response = developmentOnlyForbiddenJson();
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: DEVELOPMENT_ONLY_ERROR,
      });
    });
  });

  describe('isLocalDevelopmentAutomationRequest', () => {
    it('classifies loopback hostnames for local automation', async () => {
      const { isLocalDevelopmentAutomationHostname } = await import(
        '@/lib/security/development-only'
      );

      expect(isLocalDevelopmentAutomationHostname('localhost')).toBe(true);
      expect(isLocalDevelopmentAutomationHostname('preview.localhost')).toBe(
        true
      );
      expect(isLocalDevelopmentAutomationHostname('jov.ie')).toBe(false);
      expect(isLocalDevelopmentAutomationHostname(null)).toBe(false);
    });

    it('allows E2E automation on localhost', async () => {
      vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
      const { isLocalDevelopmentAutomationRequest } = await import(
        '@/lib/security/development-only'
      );

      expect(
        isLocalDevelopmentAutomationRequest(
          new Headers({ host: 'localhost:3000' })
        )
      ).toBe(true);
    });

    it('rejects localhost without explicit E2E opt-in', async () => {
      const { isLocalDevelopmentAutomationRequest } = await import(
        '@/lib/security/development-only'
      );

      expect(
        isLocalDevelopmentAutomationRequest(
          new Headers({ host: 'localhost:3000' })
        )
      ).toBe(false);
    });

    it('rejects public hosts even with explicit E2E opt-in', async () => {
      vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
      const { isLocalDevelopmentAutomationRequest } = await import(
        '@/lib/security/development-only'
      );

      expect(
        isLocalDevelopmentAutomationRequest(new Headers({ host: 'jov.ie' }))
      ).toBe(false);
    });
  });

  describe('shouldBypassProductionBlockedDebugPath', () => {
    it('allows loopback test-auth routes for CI automation', async () => {
      vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
      const { shouldBypassProductionBlockedDebugPath } = await import(
        '@/lib/security/development-only'
      );

      expect(
        shouldBypassProductionBlockedDebugPath(
          '/api/dev/test-auth/session',
          '127.0.0.1',
          new Headers({ host: '127.0.0.1:3100' })
        )
      ).toBe(true);
    });

    it('keeps public hosts blocked for test-auth routes', async () => {
      vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
      const { shouldBypassProductionBlockedDebugPath } = await import(
        '@/lib/security/development-only'
      );

      expect(
        shouldBypassProductionBlockedDebugPath(
          '/api/dev/test-auth/session',
          'jov.ie',
          new Headers({ host: 'jov.ie' })
        )
      ).toBe(false);
    });
  });

  describe('local production-build shell screenshot fixtures', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
      vi.stubEnv('HOSTNAME', 'localhost');
      vi.stubEnv('VERCEL', '');
      vi.stubEnv('VERCEL_ENV', '');
    });

    const routes = PRODUCT_SCREENSHOT_CAPTURE_PAGE_PATHS.filter(path =>
      path.startsWith('/demo')
    );

    it.each(routes)(
      'permits the exact local capture fixture %s',
      async route => {
        const { shouldBypassProductionBlockedDebugPath } = await import(
          '@/lib/security/development-only'
        );
        expect(
          shouldBypassProductionBlockedDebugPath(
            route,
            'localhost',
            new Headers({ host: 'localhost:3000' })
          )
        ).toBe(true);
      }
    );

    it.each([
      'https://public.example@localhost:3000',
      'http://localhost:3000',
      'user@localhost:3000',
      'localhost:3000/path',
      'localhost:3000?query',
      'localhost:3000#fragment',
      'localhost:99999',
      'localhost:invalid',
    ])(
      'rejects malformed request and forwarding authority %s',
      async authority => {
        const { shouldBypassProductionBlockedDebugPath } = await import(
          '@/lib/security/development-only'
        );
        for (const route of routes) {
          expect(
            shouldBypassProductionBlockedDebugPath(
              route,
              'localhost',
              new Headers({ host: authority })
            )
          ).toBe(false);
          expect(
            shouldBypassProductionBlockedDebugPath(
              route,
              'localhost',
              new Headers({
                host: 'localhost:3000',
                'x-forwarded-host': authority,
              })
            )
          ).toBe(false);
        }
      }
    );

    it.each(['127.0.0.1:3000', '[::1]:3000', 'localhost:3000'])(
      'permits a valid loopback authority %s',
      async host => {
        const { shouldBypassProductionBlockedDebugPath } = await import(
          '@/lib/security/development-only'
        );
        expect(
          shouldBypassProductionBlockedDebugPath(
            '/demo',
            'localhost',
            new Headers({ host, 'x-forwarded-host': host })
          )
        ).toBe(true);
      }
    );

    it.each([
      {
        name: 'missing opt-in',
        env: { E2E_USE_TEST_AUTH_BYPASS: '' },
        hostname: 'localhost',
        headers: { host: 'localhost:3000' },
      },
      {
        name: 'public server binding',
        env: { HOSTNAME: '0.0.0.0' },
        hostname: 'localhost',
        headers: { host: 'localhost:3000' },
      },
      {
        name: 'missing server binding',
        env: { HOSTNAME: '' },
        hostname: 'localhost',
        headers: { host: 'localhost:3000' },
      },
      {
        name: 'production deployment',
        env: { VERCEL_ENV: 'production' },
        hostname: 'localhost',
        headers: { host: 'localhost:3000' },
      },
      {
        name: 'preview deployment',
        env: { VERCEL_ENV: 'preview' },
        hostname: 'localhost',
        headers: { host: 'localhost:3000' },
      },
      {
        name: 'hosted development',
        env: { VERCEL_ENV: 'development' },
        hostname: 'localhost',
        headers: { host: 'localhost:3000' },
      },
      {
        name: 'hosted runtime',
        env: { VERCEL: '1' },
        hostname: 'localhost',
        headers: { host: 'localhost:3000' },
      },
      {
        name: 'public request URL',
        env: {},
        hostname: 'jov.ie',
        headers: { host: 'localhost:3000' },
      },
      {
        name: 'spoofed forwarding',
        env: {},
        hostname: 'localhost',
        headers: { host: 'jov.ie', 'x-forwarded-host': 'localhost:3000' },
      },
      {
        name: 'spoofed origin and referer',
        env: {},
        hostname: 'localhost',
        headers: {
          host: 'jov.ie',
          origin: 'http://localhost:3000',
          referer: 'http://localhost:3000/demo',
        },
      },
      {
        name: 'public forwarding',
        env: {},
        hostname: 'localhost',
        headers: { host: 'localhost:3000', 'x-forwarded-host': 'jov.ie' },
      },
      {
        name: 'forwarded host chain',
        env: {},
        hostname: 'localhost',
        headers: {
          host: 'localhost:3000',
          'x-forwarded-host': 'localhost:3000,jov.ie',
        },
      },
      {
        name: 'host chain',
        env: {},
        hostname: 'localhost',
        headers: { host: 'localhost:3000,jov.ie' },
      },
      { name: 'missing host', env: {}, hostname: 'localhost', headers: {} },
    ])(
      'denies every shell fixture with $name',
      async ({ env, hostname, headers }) => {
        for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
        const { shouldBypassProductionBlockedDebugPath } = await import(
          '@/lib/security/development-only'
        );
        for (const route of routes) {
          expect(
            shouldBypassProductionBlockedDebugPath(
              route,
              hostname,
              new Headers(headers)
            )
          ).toBe(false);
        }
      }
    );

    it.each([
      '/demo/',
      '/demo/other',
      '/demo/showcase/settings/other',
      '/demo/%2e%2e',
      '/demo%2faudience',
    ])('does not expand capture to %s', async route => {
      const { shouldBypassProductionBlockedDebugPath } = await import(
        '@/lib/security/development-only'
      );
      expect(
        shouldBypassProductionBlockedDebugPath(
          route,
          'localhost',
          new Headers({ host: 'localhost:3000' })
        )
      ).toBe(false);
    });
  });
});
