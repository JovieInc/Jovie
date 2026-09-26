import { beforeEach, describe, expect, it, vi } from 'vitest';

const addBreadcrumb = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb,
  captureException,
}));

import { trackEvent } from '@/lib/analytics/runtime-aware';

describe('runtime-aware trackEvent', () => {
  beforeEach(() => {
    addBreadcrumb.mockClear();
    captureException.mockClear();
    vi.stubEnv('NODE_ENV', 'development');
  });

  it('records event properties and leaves the distinct id off the payload', async () => {
    await trackEvent('release_viewed', { path: '/tim' }, 'user-secret-id');

    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    const payload = addBreadcrumb.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
      message: string;
    };
    expect(payload.message).toBe('[nodejs] release_viewed');
    expect(payload.data).toMatchObject({
      path: '/tim',
      runtime: 'nodejs',
      server_side: true,
    });
    expect(payload.data).not.toHaveProperty('distinctId');
    expect(JSON.stringify(payload)).not.toContain('user-secret-id');
    expect(captureException).not.toHaveBeenCalled();
  });
});
