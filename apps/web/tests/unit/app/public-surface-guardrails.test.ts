import { describe, expect, it, vi } from 'vitest';

describe('public surface guardrails', () => {
  it('keeps production robots disallows scoped to safe namespaces', async () => {
    vi.resetModules();
    vi.doMock('@/constants/app', () => ({
      BASE_URL: 'https://jov.ie',
    }));
    vi.doMock('@/lib/env-server', () => ({
      env: {
        VERCEL_ENV: 'production',
      },
    }));

    const { default: robots } = await import('../../../app/robots');
    const metadata = robots();
    const rules = Array.isArray(metadata.rules) ? metadata.rules : [];
    const wildcardRule = rules.find(rule => rule.userAgent === '*');

    expect(wildcardRule?.disallow).toEqual(
      expect.arrayContaining(['/app/', '/api/', '/out/', '/investors/'])
    );
    expect(wildcardRule?.disallow).not.toEqual(
      expect.arrayContaining([
        '/investor-portal',
        '/demo',
        '/sandbox',
        '/spinner-test',
        '/sentry-example-page',
        '/ui',
        '/hud',
      ])
    );
  });

  it('marks sensitive utility and investor routes as noindex', async () => {
    const modules = await Promise.all([
      import('../../../app/demo/layout'),
      import('../../../app/ui/layout'),
      import('../../../app/sandbox/page'),
      import('../../../app/spinner-test/page'),
      import('../../../app/sentry-example-page/layout'),
      import('../../../app/hud/page'),
      import('../../../app/investor-portal/layout'),
      import('../../../app/investor-portal/page'),
      import('../../../app/investor-portal/respond/page'),
      import('../../../app/(marketing)/ai/page'),
      import('../../../app/(marketing)/investors/page'),
    ]);

    for (const routeModule of modules) {
      expect(routeModule.metadata).toMatchObject({
        robots: {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
          },
        },
      });
    }
  }, 15_000);
});
