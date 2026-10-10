import { describe, expect, it } from 'vitest';
import { importNextConfig } from '../../lib/next-config-import';

interface RewriteCondition {
  readonly type: string;
  readonly key: string;
  readonly value?: string;
}

interface RewriteRule {
  readonly source: string;
  readonly destination: string;
  readonly missing?: readonly RewriteCondition[];
}

interface RewritesConfig {
  readonly beforeFiles?: readonly RewriteRule[];
  readonly afterFiles?: readonly RewriteRule[];
  readonly fallback?: readonly RewriteRule[];
}

function flattenRewrites(
  rewrites: readonly RewriteRule[] | RewritesConfig
): readonly RewriteRule[] {
  if (!Array.isArray(rewrites)) {
    const config = rewrites as RewritesConfig;
    return [
      ...(config.beforeFiles ?? []),
      ...(config.afterFiles ?? []),
      ...(config.fallback ?? []),
    ];
  }

  return rewrites as readonly RewriteRule[];
}

async function getHudRewrite(): Promise<RewriteRule> {
  const nextConfigModule = await importNextConfig();
  const nextConfig = nextConfigModule.default ?? nextConfigModule;
  const rewrites = flattenRewrites(await nextConfig.rewrites());
  const hudRewrite = rewrites.find(rewrite => rewrite.source === '/hud');

  expect(hudRewrite, 'Missing the /hud rewrite rule').toBeDefined();
  return hudRewrite as RewriteRule;
}

describe('/hud rewrite exemptions (JOV-7126)', () => {
  it('rewrites plain /hud to the app-shell-wrapped screen', async () => {
    const hudRewrite = await getHudRewrite();
    expect(hudRewrite.destination).toBe('/app/ov/hud');
  }, 20_000);

  it('carries exactly the three documented exemptions', async () => {
    const hudRewrite = await getHudRewrite();
    const missing = hudRewrite.missing ?? [];

    // scripts/invariants/screen-certification.mjs documents all three —
    // fs=1 (the screen-cert producer's own path to the isolated source),
    // kiosk (a signed token), and mode=kiosk — as exemptions from this
    // rewrite. A rule missing any one of them silently sends that request
    // to the wrong page without changing what the browser's URL bar shows.
    // Length checked first so an extra/missing entry fails on count, not a
    // confusing arrayContaining diff.
    expect(missing).toHaveLength(3);
    expect(missing).toEqual(
      expect.arrayContaining([
        { type: 'query', key: 'fs', value: '1' },
        { type: 'query', key: 'kiosk' },
        { type: 'query', key: 'mode', value: 'kiosk' },
      ])
    );
  }, 20_000);
});
