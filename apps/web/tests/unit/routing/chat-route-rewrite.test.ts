import { describe, expect, it } from 'vitest';

describe('chat route rewrites', () => {
  it('does not rewrite canonical /app/chat through the legacy dashboard alias', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const rewrites = await nextConfig.rewrites();

    expect(
      rewrites.find(
        (rewrite: { source: string; destination: string }) =>
          rewrite.source === '/app/chat'
      )
    ).toBeUndefined();
  });
});
