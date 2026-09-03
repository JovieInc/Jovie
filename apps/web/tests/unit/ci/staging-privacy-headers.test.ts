import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('does not add the preview-only noindex header in production', async () => {
    const rules = await loadHeaders('production');

    expect(matchingHeaderValues(rules, 'X-Robots-Tag')).toEqual([]);
  });
});
