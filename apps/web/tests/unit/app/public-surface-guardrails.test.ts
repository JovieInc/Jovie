import { describe, expect, it, vi } from 'vitest';

// Required AI crawlers per AEO strategy (JOV-11044).
// Adding/removing any of these requires an intentional PR.
const REQUIRED_AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
];

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

  describe('robots() VERCEL_ENV branch matrix — fail-safe default', () => {
    async function getRobotsMeta(vercelEnv: string | undefined) {
      vi.resetModules();
      vi.doMock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: vercelEnv },
      }));
      const { default: robots } = await import('../../../app/robots');
      return robots();
    }

    it('VERCEL_ENV=production → allow-rules (sitemap present)', async () => {
      const meta = await getRobotsMeta('production');
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.allow).toBe('/');
      expect(meta.sitemap).toBeTruthy();
    });

    it('VERCEL_ENV=preview → Disallow: / (block all)', async () => {
      const meta = await getRobotsMeta('preview');
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.disallow).toBe('/');
      expect(wildcard?.allow).toBeUndefined();
    });

    it('VERCEL_ENV=development → Disallow: / (block all)', async () => {
      const meta = await getRobotsMeta('development');
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.disallow).toBe('/');
      expect(wildcard?.allow).toBeUndefined();
    });

    it('VERCEL_ENV="" (empty) → allow-rules (fail-safe: empty ≠ preview)', async () => {
      const meta = await getRobotsMeta('');
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.allow).toBe('/');
    });

    it('VERCEL_ENV=undefined → allow-rules (fail-safe: missing ≠ preview)', async () => {
      const meta = await getRobotsMeta(undefined);
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.allow).toBe('/');
    });
  });

  describe('AEO ratchet — AI crawler allow rules (JOV-11044)', () => {
    async function getProductionRobots() {
      vi.resetModules();
      vi.doMock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: 'production' },
      }));
      const { default: robots } = await import('../../../app/robots');
      return robots();
    }

    it('production config includes explicit allow rules for all required AI crawlers', async () => {
      const meta = await getProductionRobots();
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const presentCrawlers = rules
        .map(r => (typeof r.userAgent === 'string' ? r.userAgent : null))
        .filter(Boolean);

      for (const crawler of REQUIRED_AI_CRAWLERS) {
        expect(
          presentCrawlers,
          `AI crawler "${crawler}" is missing from robots.txt — AEO regression`
        ).toContain(crawler);
      }
    });

    it('each AI crawler rule has an explicit allow: / directive', async () => {
      const meta = await getProductionRobots();
      const rules = Array.isArray(meta.rules) ? meta.rules : [];

      for (const crawler of REQUIRED_AI_CRAWLERS) {
        const rule = rules.find(r => r.userAgent === crawler);
        expect(rule, `No rule found for AI crawler "${crawler}"`).toBeDefined();
        const allow = rule?.allow;
        const allowList = Array.isArray(allow) ? allow : [allow];
        expect(
          allowList,
          `AI crawler "${crawler}" must have allow: "/" but does not`
        ).toContain('/');
      }
    });

    it('production sitemap URL is the canonical https://jov.ie/sitemap.xml', async () => {
      const meta = await getProductionRobots();
      expect(meta.sitemap).toBe('https://jov.ie/sitemap.xml');
    });

    it('production wildcard rule does not have a bare Disallow: / (JOV-11043 regression guard)', async () => {
      const meta = await getProductionRobots();
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');

      // The incident: VERCEL_ENV missing → isProduction was false → Disallow: '/'
      // This test catches any future regression that would block all crawlers in production.
      expect(wildcard?.allow).toBe('/');
      expect(wildcard?.disallow).not.toBe('/');
      const disallowList = Array.isArray(wildcard?.disallow)
        ? wildcard.disallow
        : [wildcard?.disallow];
      expect(disallowList).not.toContain('/');
    });
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
      import('../../../app/pitch/page'),
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
