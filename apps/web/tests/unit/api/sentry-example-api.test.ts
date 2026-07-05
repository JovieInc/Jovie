import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('GET /api/sentry-example-api', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 outside explicit development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    const { GET } = await import('@/app/api/sentry-example-api/route');
    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Not available outside development',
    });
  });

  it('throws an intentional error so Sentry can capture a 500 response', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { GET } = await import('@/app/api/sentry-example-api/route');

    await expect(GET()).rejects.toThrow('Intentional Sentry example API error');
  });
});
