import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('GET /api/version', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the build-time SHA when available', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', 'abcdef1');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '1234567890abcdef');

    const { GET } = await import('@/app/api/version/route');
    const response = GET();

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ buildId: 'abcdef1' });
  });

  it('falls back to the runtime SHA when build-time SHA is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '1234567890abcdef');

    const { GET } = await import('@/app/api/version/route');
    const response = GET();

    expect(await response.json()).toEqual({ buildId: '1234567' });
  });
});
