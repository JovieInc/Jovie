import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ensureSentry', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.doUnmock('@/instrumentation');
    vi.resetModules();
  });

  it('skips server bootstrap in local E2E mode', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/instrumentation', () => ({ register }));
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_E2E_MODE = '1';
    delete process.env.JOVIE_ENABLE_LOCAL_SENTRY;

    const { ensureSentry } = await import('@/lib/sentry/ensure');
    await ensureSentry();

    expect(register).not.toHaveBeenCalled();
  });

  it('allows explicit local Sentry opt-in', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/instrumentation', () => ({ register }));
    process.env.NODE_ENV = 'test';
    process.env.NEXT_PUBLIC_E2E_MODE = '1';
    process.env.JOVIE_ENABLE_LOCAL_SENTRY = '1';

    const { ensureSentry } = await import('@/lib/sentry/ensure');
    await ensureSentry();

    expect(register).toHaveBeenCalledTimes(1);
  });
});
