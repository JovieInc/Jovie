import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('GET /api/sentry-example-api', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws an intentional error so Sentry can capture a 500 response', async () => {
    const { GET } = await import('@/app/api/sentry-example-api/route');

    await expect(GET()).rejects.toThrow('Intentional Sentry example API error');
  });
});
