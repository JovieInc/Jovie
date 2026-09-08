import { afterEach, describe, expect, it, vi } from 'vitest';

describe('env-public', () => {
  afterEach(() => {
    delete document.documentElement.dataset.authMock;
    delete document.documentElement.dataset.authProxyDisabled;
    delete document.documentElement.dataset.e2eMode;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reads auth mock mode from the runtime html dataset', async () => {
    document.documentElement.dataset.authMock = '1';

    const { publicEnv } = await import('@/lib/env-public');

    expect(publicEnv.NEXT_PUBLIC_AUTH_MOCK).toBe('1');
  });

  it('reads retired Clerk mock env as AUTH_MOCK fallback', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_MOCK', '1');

    const { publicEnv } = await import('@/lib/env-public');

    expect(publicEnv.NEXT_PUBLIC_AUTH_MOCK).toBe('1');
  });

  it('reads auth proxy disabling from the runtime html dataset', async () => {
    document.documentElement.dataset.authProxyDisabled = '1';

    const { publicEnv } = await import('@/lib/env-public');

    expect(publicEnv.NEXT_PUBLIC_AUTH_PROXY_DISABLED).toBe('1');
  });

  it('reads E2E mode from the runtime html dataset', async () => {
    document.documentElement.dataset.e2eMode = '1';

    const { publicEnv } = await import('@/lib/env-public');

    expect(publicEnv.NEXT_PUBLIC_E2E_MODE).toBe('1');
  });
});
