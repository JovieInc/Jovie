import { afterEach, describe, expect, it, vi } from 'vitest';
import { RENDER_FIXTURE_X_ROBOTS_TAG } from '@/lib/render-fixture-policy';

const originalVercelEnv = process.env.VERCEL_ENV;

async function loadHeaders(vercelEnv: string) {
  process.env.VERCEL_ENV = vercelEnv;
  vi.resetModules();
  const nextConfigModule = await import('../../../next.config.js');
  const nextConfig = nextConfigModule.default ?? nextConfigModule;
  return nextConfig.headers();
}

function matchingHeaderValues(
  rules: Awaited<ReturnType<typeof loadHeaders>>,
  key: string
) {
  return rules.flatMap(rule =>
    rule.headers
      .filter(header => header.key.toLowerCase() === key.toLowerCase())
      .map(header => header.value)
  );
}

afterEach(() => {
  if (originalVercelEnv === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
  vi.resetModules();
});

describe('staging preview privacy headers', () => {
  it('adds a fail-safe noindex response header to Vercel previews', async () => {
    const rules = await loadHeaders('preview');
    const values = matchingHeaderValues(rules, 'X-Robots-Tag');

    expect(values.length).toBeGreaterThan(0);
    expect(values.every(value => value.includes('noindex'))).toBe(true);
    expect(values.every(value => value.includes('nofollow'))).toBe(true);
  }, 60_000);

  it('adds the preview-only noindex header in production only to the render-fixture routes', async () => {
    const rules = await loadHeaders('production');

    // lib/render-fixture-policy.ts owns these sources: internal render
    // fixtures deny in production, and the profile-mode destination is a real
    // production route that must stay non-indexable at the HTTP layer.
    const fixtureSourceRules = rules.filter(
      rule =>
        rule.source === '/renders/:path*' ||
        rule.source === '/:username/profile-mode-render/:path*'
    );
    expect(fixtureSourceRules).toHaveLength(2);
    for (const rule of fixtureSourceRules) {
      const values = matchingHeaderValues([rule], 'X-Robots-Tag');
      expect(values).toEqual([RENDER_FIXTURE_X_ROBOTS_TAG]);
    }

    // Every other production rule stays free of the preview-only header.
    const otherRules = rules.filter(
      rule =>
        rule.source !== '/renders/:path*' &&
        rule.source !== '/:username/profile-mode-render/:path*'
    );
    expect(matchingHeaderValues(otherRules, 'X-Robots-Tag')).toEqual([]);
  });
});
