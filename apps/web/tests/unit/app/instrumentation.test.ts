import { afterEach, describe, expect, it, vi } from 'vitest';

describe('server instrumentation guard', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('skips server observability in local E2E mode', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'test';
    process.env.NEXT_PUBLIC_E2E_MODE = '1';
    delete process.env.JOVIE_ENABLE_LOCAL_SENTRY;

    const { shouldSkipServerObservability } = await import('@/instrumentation');

    expect(shouldSkipServerObservability()).toBe(true);
  });

  it('keeps server observability enabled in production', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const { shouldSkipServerObservability } = await import('@/instrumentation');

    expect(shouldSkipServerObservability()).toBe(false);
  });
});
