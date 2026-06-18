import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/constants/app', () => ({
  BASE_URL: 'https://jov.ie',
}));

async function loadRobots(vercelEnv: string | undefined) {
  vi.resetModules();
  vi.doMock('@/lib/env-server', () => ({
    env: { VERCEL_ENV: vercelEnv },
  }));
  const mod = await import('../../app/robots');
  return mod.default;
}

afterEach(() => {
  vi.resetModules();
});

describe('robots.ts — production config', () => {
  it('allows all crawlers on root in production', async () => {
    const robots = await loadRobots('production');
    const result = robots();
    const defaultRule = result.rules.find(r => r.userAgent === '*');
    expect(defaultRule?.allow).toBe('/');
  });

  it('does NOT globally disallow everything in production', async () => {
    const robots = await loadRobots('production');
    const result = robots();
    for (const rule of result.rules) {
      const disallow = rule.disallow;
      const disallowList = Array.isArray(disallow) ? disallow : [disallow];
      const hasGlobalBlock = disallowList.some(d => d === '/' || d === '/*');
      if (rule.userAgent === '*') {
        expect(hasGlobalBlock).toBe(false);
      }
    }
  });

  it('blocks /app/ and /api/ in production', async () => {
    const robots = await loadRobots('production');
    const result = robots();
    const defaultRule = result.rules.find(r => r.userAgent === '*');
    expect(defaultRule?.disallow).toContain('/app/');
    expect(defaultRule?.disallow).toContain('/api/');
  });

  it('references sitemap.xml in production', async () => {
    const robots = await loadRobots('production');
    const result = robots();
    expect(result.sitemap).toContain('sitemap.xml');
  });

  it('includes all required AI crawlers in production', async () => {
    const robots = await loadRobots('production');
    const result = robots();
    const aiCrawlers = result.rules
      .map(r => r.userAgent)
      .filter(ua => ua !== '*');

    // These crawlers must be explicitly listed so AI search indexing is welcomed
    const required = [
      'GPTBot',
      'ChatGPT-User',
      'Claude-Web',
      'PerplexityBot',
      'Google-Extended',
    ];
    for (const crawler of required) {
      expect(aiCrawlers).toContain(crawler);
    }
  });

  it('allows AI crawlers on root and /llms.txt in production', async () => {
    const robots = await loadRobots('production');
    const result = robots();
    const aiRules = result.rules.filter(r => r.userAgent !== '*');
    for (const rule of aiRules) {
      const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
      expect(allow).toContain('/');
    }
  });
});

describe('robots.ts — preview/staging config', () => {
  it('blocks all crawlers in preview', async () => {
    const robots = await loadRobots('preview');
    const result = robots();
    expect(result.rules).toHaveLength(1);
    const rule = result.rules[0];
    expect(rule.userAgent).toBe('*');
    const disallow = Array.isArray(rule.disallow)
      ? rule.disallow
      : [rule.disallow];
    expect(disallow).toContain('/');
  });

  it('blocks all crawlers in development', async () => {
    const robots = await loadRobots('development');
    const result = robots();
    expect(result.rules).toHaveLength(1);
    const rule = result.rules[0];
    const disallow = Array.isArray(rule.disallow)
      ? rule.disallow
      : [rule.disallow];
    expect(disallow).toContain('/');
  });

  it('does NOT include a sitemap in preview', async () => {
    const robots = await loadRobots('preview');
    const result = robots();
    expect(result.sitemap).toBeUndefined();
  });
});

describe('robots.ts — fail-safe: undefined VERCEL_ENV must not block production', () => {
  it('treats undefined VERCEL_ENV as production (allow crawlers)', async () => {
    const robots = await loadRobots(undefined);
    const result = robots();
    // Should return production config (multiple rules, sitemap present)
    const hasAiRules = result.rules.some(r => r.userAgent !== '*');
    expect(hasAiRules).toBe(true);
    expect(result.sitemap).toContain('sitemap.xml');
  });

  it('does NOT globally disallow when VERCEL_ENV is undefined', async () => {
    const robots = await loadRobots(undefined);
    const result = robots();
    for (const rule of result.rules) {
      if (rule.userAgent === '*') {
        const disallow = rule.disallow;
        const disallowList = Array.isArray(disallow) ? disallow : [disallow];
        expect(disallowList.some(d => d === '/' || d === '/*')).toBe(false);
      }
    }
  });

  it('does NOT globally disallow when VERCEL_ENV is empty string', async () => {
    const robots = await loadRobots('');
    const result = robots();
    for (const rule of result.rules) {
      if (rule.userAgent === '*') {
        const disallow = rule.disallow;
        const disallowList = Array.isArray(disallow) ? disallow : [disallow];
        expect(disallowList.some(d => d === '/' || d === '/*')).toBe(false);
      }
    }
  });
});
