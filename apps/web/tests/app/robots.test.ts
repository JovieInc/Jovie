/**
 * SEO/AEO guardrail: robots.ts behavior must never silently de-index jov.ie.
 *
 * Incident background (JovieInc/Jovie#11043): a VERCEL_ENV change baked
 * `Disallow: /` for all crawlers in production. The fix made the logic
 * fail-safe (undefined VERCEL_ENV → production allow-rules, not block-all).
 * This test locks that behavior so it can never silently regress.
 *
 * robots.ts evaluates isPreview/isProduction at module load time, so each
 * scenario uses vi.resetModules() + vi.doMock() + dynamic import.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Minimum set of AI crawlers that MUST be explicitly allowed in production.
// Losing any of these from the allow-list silently de-indexes Jovie from
// AI-search surfaces (ChatGPT Browse, Perplexity, Google AI Overviews, etc.).
const REQUIRED_AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function importRobots(vercelEnv: string | undefined) {
  vi.doMock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));
  vi.doMock('@/lib/env-server', () => ({
    env: { VERCEL_ENV: vercelEnv },
  }));
  const { default: robots } = await import('../../app/robots');
  return robots;
}

function allDisallows(rules: unknown[]): string[] {
  return rules.flatMap(rule => {
    const r = rule as { disallow?: string | string[] };
    const d = r.disallow;
    if (!d) return [];
    return Array.isArray(d) ? d : [d];
  });
}

// ---------------------------------------------------------------------------
// Production (fail-safe default)
// ---------------------------------------------------------------------------

describe('robots.ts — production behavior', () => {
  it.each([
    ['undefined (fail-safe default)', undefined],
    ['empty string', ''],
  ])('VERCEL_ENV=%s never emits a global Disallow: /', async (_label, vercelEnv) => {
    const robots = await importRobots(vercelEnv);
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const disallows = allDisallows(rules);

    // The bare '/' disallow blocks everything — it must never appear in
    // any production rule for any user-agent.
    expect(disallows).not.toContain('/');
  });

  it('includes sitemap URL pointing to /sitemap.xml', async () => {
    const robots = await importRobots(undefined);
    const result = robots();
    expect(result.sitemap).toBeDefined();
    expect(String(result.sitemap)).toMatch(/\/sitemap\.xml$/);
  });

  it('allows / for the wildcard (*) user-agent', async () => {
    const robots = await importRobots(undefined);
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const wildcardRule = rules.find(r => {
      const ua = (r as { userAgent?: string | string[] }).userAgent;
      return ua === '*' || (Array.isArray(ua) && ua.includes('*'));
    });
    expect(
      wildcardRule,
      'wildcard (*) user-agent rule must exist'
    ).toBeDefined();
    const allows = (wildcardRule as { allow?: string | string[] }).allow;
    const allowList = Array.isArray(allows) ? allows : [allows];
    expect(allowList).toContain('/');
  });

  it.each(
    REQUIRED_AI_CRAWLERS
  )('explicitly allows AI crawler "%s" in production', async crawler => {
    const robots = await importRobots(undefined);
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const agentNames = rules.flatMap(r => {
      const ua = (r as { userAgent?: string | string[] }).userAgent;
      return Array.isArray(ua) ? ua : ua ? [ua] : [];
    });
    expect(agentNames, `missing AI crawler rule: ${crawler}`).toContain(
      crawler
    );
  });

  it('AI crawler rules allow / and do not globally block all paths', async () => {
    const robots = await importRobots(undefined);
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

    for (const crawler of REQUIRED_AI_CRAWLERS) {
      const rule = rules.find(r => {
        const ua = (r as { userAgent?: string | string[] }).userAgent;
        return ua === crawler || (Array.isArray(ua) && ua.includes(crawler));
      });
      if (!rule) continue; // already caught by per-crawler test above

      const allows = (rule as { allow?: string | string[] }).allow;
      const allowList = Array.isArray(allows) ? allows : allows ? [allows] : [];
      expect(allowList, `${crawler} must allow /`).toContain('/');

      const disallows = allDisallows([rule]);
      expect(
        disallows,
        `${crawler} must not have global Disallow: /`
      ).not.toContain('/');
    }
  });
});

// ---------------------------------------------------------------------------
// Preview / staging (intentional block-all)
// ---------------------------------------------------------------------------

describe('robots.ts — preview/staging behavior', () => {
  it.each([
    ['preview', 'preview'],
    ['development', 'development'],
  ])('VERCEL_ENV=%s blocks all crawlers with Disallow: /', async (_label, vercelEnv) => {
    const robots = await importRobots(vercelEnv);
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const disallows = allDisallows(rules);

    expect(
      disallows,
      `VERCEL_ENV=${vercelEnv} must block all crawlers`
    ).toContain('/');
  });

  it('VERCEL_ENV=preview emits no sitemap', async () => {
    const robots = await importRobots('preview');
    const result = robots();
    expect(result.sitemap).toBeUndefined();
  });
});
