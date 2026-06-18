/**
 * SEO/AEO ratchet: robots.txt guardrail (#11044)
 *
 * Prevents silent regression of the robots.txt configuration.
 * Incident #11043: a single env change baked `Disallow: /` site-wide with zero alarm.
 *
 * Rules enforced here:
 *  1. Production mode must NEVER include a global `Disallow: /` for the wildcard agent.
 *  2. Missing/undefined VERCEL_ENV must fail-safe to production rules (not blocking).
 *  3. Production mode must reference the sitemap URL.
 *  4. Production mode must explicitly welcome AI crawlers: GPTBot, Claude-Web,
 *     PerplexityBot, and Google-Extended.
 *  5. AI-crawler rules must include an Allow for '/' (not just block everything).
 *  6. Preview/development mode is allowed to block all (intentional behaviour).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_URL = 'https://jov.ie';
const EXPECTED_SITEMAP_URL = `${BASE_URL}/sitemap.xml`;

// Required AI crawlers per issue #11044 / AEO epic #11029.
const REQUIRED_AI_CRAWLERS = [
  'GPTBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
];

type RobotsRule = {
  userAgent: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
};

type RobotsResult = {
  rules: RobotsRule[];
  sitemap?: string;
  host?: string;
};

/**
 * Returns `true` if the rule is the catastrophic "block all" pattern that
 * caused the #11043 incident: userAgent `*` with disallow set to `'/'`
 * (and no compensating allow for '/').
 */
function isGlobalBlock(rule: RobotsRule): boolean {
  const agents = Array.isArray(rule.userAgent)
    ? rule.userAgent
    : [rule.userAgent];
  if (!agents.includes('*')) return false;

  const disallows =
    rule.disallow === undefined
      ? []
      : Array.isArray(rule.disallow)
        ? rule.disallow
        : [rule.disallow];
  if (!disallows.includes('/')) return false;

  // A disallow of '/' is only catastrophic if there is no allow for '/'.
  const allows =
    rule.allow === undefined
      ? []
      : Array.isArray(rule.allow)
        ? rule.allow
        : [rule.allow];
  return !allows.includes('/');
}

describe('robots.ts SEO ratchet', () => {
  beforeEach(() => {
    // Reset module registry so each test re-evaluates the module-level constants
    // (`isPreview` / `isProduction`) with a fresh mock for VERCEL_ENV.
    vi.resetModules();
  });

  describe('production mode (VERCEL_ENV = "production")', () => {
    async function loadProductionRobots(): Promise<RobotsResult> {
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: 'production' },
      }));
      vi.doMock('@/constants/app', () => ({ BASE_URL }));
      const { default: robots } = await import('../../app/robots');
      return robots() as RobotsResult;
    }

    it('must not include a global Disallow: / for the wildcard agent', async () => {
      const result = await loadProductionRobots();
      const blocking = result.rules.filter(isGlobalBlock);
      expect(blocking).toHaveLength(0);
    });

    it('must reference the sitemap URL', async () => {
      const result = await loadProductionRobots();
      expect(result.sitemap).toBe(EXPECTED_SITEMAP_URL);
    });

    it('must explicitly allow crawling of "/" for the wildcard agent', async () => {
      const result = await loadProductionRobots();
      const wildcardRule = result.rules.find(r => {
        const agents = Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent];
        return agents.includes('*');
      });
      expect(wildcardRule).toBeDefined();
      const allows =
        wildcardRule!.allow === undefined
          ? []
          : Array.isArray(wildcardRule!.allow)
            ? wildcardRule!.allow
            : [wildcardRule!.allow];
      expect(allows).toContain('/');
    });

    it('must include a dedicated rule for each required AI crawler', async () => {
      const result = await loadProductionRobots();
      const crawlerAgents = result.rules.flatMap(r =>
        Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent]
      );
      for (const crawler of REQUIRED_AI_CRAWLERS) {
        expect(crawlerAgents).toContain(crawler);
      }
    });

    it('must allow "/" for every required AI crawler', async () => {
      const result = await loadProductionRobots();
      for (const crawler of REQUIRED_AI_CRAWLERS) {
        const rule = result.rules.find(r => {
          const agents = Array.isArray(r.userAgent)
            ? r.userAgent
            : [r.userAgent];
          return agents.includes(crawler);
        });
        expect(rule).toBeDefined();
        const allows =
          rule!.allow === undefined
            ? []
            : Array.isArray(rule!.allow)
              ? rule!.allow
              : [rule!.allow];
        expect(allows).toContain('/');
      }
    });
  });

  describe('fail-safe: undefined VERCEL_ENV must NOT block production crawlers', () => {
    it('produces allow-rules (not a global block) when VERCEL_ENV is undefined', async () => {
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: undefined },
      }));
      vi.doMock('@/constants/app', () => ({ BASE_URL }));
      const { default: robots } = await import('../../app/robots');
      const result = robots() as RobotsResult;

      const blocking = result.rules.filter(isGlobalBlock);
      expect(blocking).toHaveLength(0);
    });

    it('references the sitemap when VERCEL_ENV is undefined', async () => {
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: undefined },
      }));
      vi.doMock('@/constants/app', () => ({ BASE_URL }));
      const { default: robots } = await import('../../app/robots');
      const result = robots() as RobotsResult;
      expect(result.sitemap).toBe(EXPECTED_SITEMAP_URL);
    });
  });

  describe('preview / development mode', () => {
    it('VERCEL_ENV="preview" correctly blocks all crawlers', async () => {
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: 'preview' },
      }));
      vi.doMock('@/constants/app', () => ({ BASE_URL }));
      const { default: robots } = await import('../../app/robots');
      const result = robots() as RobotsResult;

      // Preview should have a global block for the wildcard agent
      const wildcardRule = result.rules.find(r => {
        const agents = Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent];
        return agents.includes('*');
      });
      expect(wildcardRule).toBeDefined();
      const disallows =
        wildcardRule!.disallow === undefined
          ? []
          : Array.isArray(wildcardRule!.disallow)
            ? wildcardRule!.disallow
            : [wildcardRule!.disallow];
      expect(disallows).toContain('/');
    });

    it('VERCEL_ENV="preview" does not expose a sitemap', async () => {
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: 'preview' },
      }));
      vi.doMock('@/constants/app', () => ({ BASE_URL }));
      const { default: robots } = await import('../../app/robots');
      const result = robots() as RobotsResult;
      expect(result.sitemap).toBeUndefined();
    });

    it('VERCEL_ENV="development" correctly blocks all crawlers', async () => {
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: 'development' },
      }));
      vi.doMock('@/constants/app', () => ({ BASE_URL }));
      const { default: robots } = await import('../../app/robots');
      const result = robots() as RobotsResult;

      const wildcardRule = result.rules.find(r => {
        const agents = Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent];
        return agents.includes('*');
      });
      expect(wildcardRule).toBeDefined();
      const disallows =
        wildcardRule!.disallow === undefined
          ? []
          : Array.isArray(wildcardRule!.disallow)
            ? wildcardRule!.disallow
            : [wildcardRule!.disallow];
      expect(disallows).toContain('/');
    });
  });
});
