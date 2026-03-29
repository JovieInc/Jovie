import { afterEach, describe, expect, it, vi } from 'vitest';

describe('env-client', () => {
  afterEach(() => {
    delete document.documentElement.dataset.e2eMode;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('treats the html runtime flag as E2E mode', async () => {
    document.documentElement.dataset.e2eMode = '1';

    const { env } = await import('@/lib/env-client');

    expect(env.IS_E2E).toBe(true);
  });

  it('treats test auth bypass as E2E mode without a build-time public flag', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    const { env } = await import('@/lib/env-client');

    expect(env.IS_E2E).toBe(true);
  });
});
