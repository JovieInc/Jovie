import { afterEach, describe, expect, it, vi } from 'vitest';

describe('env-public', () => {
  afterEach(() => {
    delete document.documentElement.dataset.clerkMock;
    delete document.documentElement.dataset.clerkProxyDisabled;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reads Clerk mock mode from the runtime html dataset', async () => {
    document.documentElement.dataset.clerkMock = '1';

    const { publicEnv } = await import('@/lib/env-public');

    expect(publicEnv.NEXT_PUBLIC_CLERK_MOCK).toBe('1');
  });

  it('reads Clerk proxy disabling from the runtime html dataset', async () => {
    document.documentElement.dataset.clerkProxyDisabled = '1';

    const { publicEnv } = await import('@/lib/env-public');

    expect(publicEnv.NEXT_PUBLIC_CLERK_PROXY_DISABLED).toBe('1');
  });
});
