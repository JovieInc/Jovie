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

  it('treats NEXT_PUBLIC_E2E_MODE as E2E mode', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');

    const { env } = await import('@/lib/env-client');

    expect(env.IS_E2E).toBe(true);
  });
});
