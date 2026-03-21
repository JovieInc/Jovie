import { describe, expect, it } from 'vitest';

describe('marketing pricing route redirects', () => {
  it('does not redirect /pricing back to the homepage', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = await nextConfig.redirects();

    expect(
      redirects.find(
        (redirect: { source: string; destination: string }) =>
          redirect.source === '/pricing' && redirect.destination === '/'
      )
    ).toBeUndefined();
  });
});
