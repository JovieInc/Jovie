import { describe, expect, it } from 'vitest';

type RewriteRule = {
  readonly source: string;
  readonly destination: string;
};

function flattenRewrites(
  rewrites:
    | RewriteRule[]
    | {
        readonly beforeFiles?: readonly RewriteRule[];
        readonly afterFiles?: readonly RewriteRule[];
        readonly fallback?: readonly RewriteRule[];
      }
): readonly RewriteRule[] {
  if (Array.isArray(rewrites)) {
    return rewrites;
  }

  return [
    ...(rewrites.beforeFiles ?? []),
    ...(rewrites.afterFiles ?? []),
    ...(rewrites.fallback ?? []),
  ];
}

describe('chat route rewrites', () => {
  it('does not rewrite canonical /app/chat through the legacy dashboard alias', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const rewrites = flattenRewrites(await nextConfig.rewrites());

    expect(
      rewrites.find(rewrite => rewrite.source === '/app/chat')
    ).toBeUndefined();
  });
});
