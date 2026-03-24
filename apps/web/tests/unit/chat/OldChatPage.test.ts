import { describe, expect, it } from 'vitest';

describe('legacy dashboard chat redirect', () => {
  it('is preserved in next.config.js', async () => {
    const nextConfig = require('../../../next.config.js');
    const redirects = await nextConfig.redirects();
    const legacyRedirect = redirects.find(
      (redirect: { source: string }) =>
        redirect.source === '/app/dashboard/chat'
    );

    expect(legacyRedirect).toMatchObject({
      source: '/app/dashboard/chat',
      destination: '/app/chat',
      permanent: false,
    });
  });
});
